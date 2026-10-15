# Independent author and verifier

This harness does not change the application classifier, confidence rules, prompt, API or frontend. It adds local test tooling and npm scripts; it reuses Node's built-in test runner, fetch, readline, dotenv and the existing Anthropic SDK. No additional npm dependencies.

## Two separate roles

**Test Author** (`tests/author/`) calls Claude with its own prompt and fictional source inputs. It does not run the app, read reports, inspect scoring implementation or learn labels from app output. It drafts expected labels, not measured ground truth. Each model call starts with fresh messages. Generation never reads the approved gold set.

**Verifier** (`tests/verifier/`) reads approved cases only from `tests/gold.json`, calls the real running API three times per case, and writes observations under `tests/report/`. It never imports the author's prompt or code, reads the draft set, or changes cases or gold labels. It uses no extra LLM judge. The human-reviewed gold file is the only case handoff. These are separate workflows/contexts, not an OS security boundary against someone deliberately rewriting scripts.

The older `server/scoring/gold.json` remains unchanged: it contains extracted-claim fixtures for existing deterministic tests, not the HTTP request format. The new corpus holds full transcript strings for real API tests. The six original sample issues are preserved as isolated source pairs; missing broader conversational context is not silently added. A full multi-topic deposition is a separate test scenario.

## Run in order

1. Configure the existing `ANTHROPIC_API_KEY` in the root `.env`. Run `npm run tests:author`. This calls Anthropic and incurs usage. It writes at least 25 draft cases to `tests/gold.draft.json`, with proposed labels and rationale; never approved labels. Raw responses/errors are retained under the author directory. Inspect the actual model response if validation fails; the harness does not repair it or silently retry with different settings.
2. Run `npm run tests:approve`. Read both texts, the proposed type, evidence status, score band and rationale. Use **a** to approve, **e** to edit, **r** to reject. Only cases you approve enter `tests/gold.json`. Rejections remain recorded; undecided cases remain drafts. You may review the six sample issues first using the review command's ID filter. Do not infer approval from the author's confidence or from an app response.
3. Start the app as usual. `npm run dev` is unchanged and starts Vite; its `/api` proxy requires the Express server. The existing one-command full startup is `node start.mjs`; alternatively run `node server/server.js` in another terminal.
4. Run `npm run tests:verify`. The default API base is `http://localhost:3000`; see the verifier CLI help/options for a different base or an explicit subset. There are three attempts per selected approved case, including failed requests—no automatic retries to replace bad results. These calls invoke the app's Claude analysis and incur API usage.
5. Open `tests/report/report.html`. Failures/review cases appear first. Compare expected labels with all actual findings, grounded quotes, score breakdown and author rationale; fill in the Human verified Y/N boxes and notes. Print from your browser to save a PDF. `npm run tests:all` runs verification and prints the report path even when tests fail.

Optional: `npm run tests:all -- --pdf` also prints the HTML using an installed local Chrome/Chromium in a temporary browser profile. Set `TEST_REPORT_BROWSER` to an installed browser executable if needed. It validates the PDF header and preserves a previous PDF; failure is explicit and HTML remains available. This export is static; enter any review notes in the HTML first and use your browser's Print command to include those notes.

Run `npm run tests:unit` for the harness and deterministic invariants without paid model calls. A failing run exits nonzero; a written report does not imply a passing run. Reports/raw responses can contain transcripts, so generated files are ignored by the local `tests/.gitignore` by default. Keep them private when using real inputs.

## Actual application contract

`POST /api/analyze`, JSON `{ "transcript1": "...", "transcript2": "..." }`. Each must be a non-empty string. The response contains `topicsReviewed` and `contradictions`. Each finding contains `claim1`, `claim2`, `type`, `severity`, `reasoning` and deterministic fields supplied by `assessCandidate`.

| App field | Meaning in the harness |
| --- | --- |
| `type` | DIRECT, INFERENTIAL or FALSE_POSITIVE; compared literally with the expected type |
| `status: CONFLICT_SUPPORTED` | Expected evidence CONFLICT |
| `status: COMPATIBLE_SUPPORTED` | Expected evidence COMPATIBLE |
| `status: NOT_EVALUABLE` | Expected evidence NOT_EVALUABLE; score and humanConfidence must both be null |
| `score`, `humanConfidence` | Aliases for the deterministic result; both checked without overwriting actual values |
| `band` | STRONG, MODERATE, LIMITED, WEAK; NOT_EVALUABLE is represented as null only in the expectation comparison |
| `evidenceStrength`, `evidenceScore` | Evidence-rule strength aliases, distinct from the final numeric score |
| `commitment`, `rulesFired`, `rulesLimiting`, `languageDetails` | Score breakdown and limitations displayed in the report |
| `claim1.original`, `claim2.original` and extracted phrase fields | Must be literal substrings of their respective transcript/quote, without normalization |

The app has no request parameter for temperature and currently does not set one in its internal Claude call. The harness cannot force temperature zero without changing app logic; reports disclose this. The author requests zero for models where that parameter applies. The actual provider rejected zero as deprecated for `claude-opus-5-5`, so that known model now selects and loudly records provider-default temperature before its call. Other models request zero unless explicitly opted into provider defaults. The failed initial attempt and explicit second call remain archived; there is no automatic retry or relabeling. Author and app models may be configured differently; do not mistake stable temperature settings for guaranteed determinism.

## Interpretation and failure expectations

Every case expects one candidate for one factual issue. Zero candidates is a missing-pair failure, including compatible cases the production prompt may intentionally omit. Multiple candidates are all retained and reported as unexpected extras; the verifier never selects whichever one best matches the gold label. Bad JSON, invalid source phrases and schema errors in successful HTTP responses remain failures in the denominators. Failed requests are ungraded availability errors; the availability gate can suppress the entire run. Unapproved cases are explicitly excluded/rejected, not run as approved.

Headline type/evidence/band accuracy and stability describe the selected approved cases and three attempts, not general legal accuracy. Required stability checks three valid runs agreeing on type. Band stability and provisional band mismatches are informational. Compatibility has a separate small index, not confidence in a contradiction. NOT_EVALUABLE means the code cannot score that evidence, not that Claude's classification was automatically wrong. All numeric weights/bands in the application remain uncalibrated heuristics.

A unanimous valid disagreement in 3/3 runs is a request for a human to recheck the gold label—not permission to relabel it. Inspect errors and original testimony, then use the author's explicit human review workflow if a correction is warranted. Report observations must never become hidden training inputs to the author.

Invariants stub model candidates while keeping literal evidence fixed and vary only model opinion fields. They also check invalid evidence/null-score behavior and candidate preservation at the pipeline boundary and through the unchanged HTTP server with a stubbed SDK transport. The existing server explicitly deduplicates byte-identical candidates (two become one); the invariant output documents this existing boundary rather than pretending it preserves identical duplicates. API-level empty/extra candidate checks catch omissions visible at the HTTP boundary; no harness can infer unreturned internal model candidates from the final response alone.

## Current test fixtures and observed results

The author prompt requires 12 explicit coverage tags spanning the requested features and preserves the six source-input seeds. Schema/coverage validation proves those tags and source strings are present; it does not prove the author's semantic judgment is correct. Review the rationale, especially whether a hedge changes a disputed value or only certainty about an event.

The isolated harness/protocol tests were actually run during implementation: 43 Node tests passed, including the real HTTP server with a stubbed LLM. The existing Vite production build also passed. These observations are separate from any live approved-gold test results. Live observations, errors and their denominators appear in the generated report; unapproved drafts are never claimed as successful app tests.

## Owner batch approved 2026-10-14

The explicit batch decision is archived in `tests/author/batches/owner-reviewed-batch-2026-10-14.json`. It promotes 23 IDs and holds eight as drafts. Five approvals cover type only; `review_policy.approval_scope` and `evidence_assertion` prevent their provisional evidence expectations from being enforced. No app label or score is changed. All expected bands remain provisional. The local account name `zerayyang` identifies the approving owner; it is not an asserted legal name. AI review plus owner batch approval does not claim individual human verification. Prior explicit review of sample-home is preserved.

Explicit owner decisions can be saved using `node tests/author/batch.mjs --decision tests/author/batches/owner-reviewed-batch-2026-10-14.json` (already applied; batch IDs cannot be reused). Archives under `tests/author/reviews/` preserve originals, a before/after plan and a write-progress journal. Eight held IDs retain their proposed labels and hold reasons; the verifier never runs them.

Score assertions enforce no conflict score for FALSE_POSITIVE and an exact DIRECT score at least as high as an approximate INFERENTIAL within the same implemented pattern. The time pair is explicitly grouped in review metadata. The ordinal check reports SKIPPED if valid numeric conflict scores with a common fired rule are unavailable, rather than inventing scores or comparing unrelated patterns. Type/evidence and grounding errors remain failures. Band mismatches do not cause failure or gold-label recheck.


Availability gate: ECONNREFUSED aborts remaining requests immediately. Other transport/HTTP failures are retained; fewer than half of attempted requests succeeding makes the whole run NOT_RUN before normal reporting. The terminal and diagnostic report header say `NOT RUN: server unreachable (N/M requests failed). No accuracy results.` N/M counts failed/attempted requests, with unattempted requests shown separately. No accuracy, case pass/fail, or stability results are awarded in that run (JSON values are null); raw diagnostics and separate invariant observations remain archived. Exactly half succeeding does not trigger the ratio gate. In a completed but partial run, failed HTTP/transport requests remain ungraded and outside accuracy denominators; cases missing attempts are INCOMPLETE. A successful HTTP response with malformed JSON or bad app output remains a protocol failure, not an unreachable server. NOT_RUN exits nonzero, so automation cannot mistake it for a passing test.

## Level 2 real-world sources

See [author/LEVEL2.md](author/LEVEL2.md). `npm run tests:level2 -- prepare ...` snapshots two saved testimony documents and a separate lawyer/judge analysis. `append` validates exact passages and adds only drafts to the existing corpus; it never generates cases or promotes labels. Sources, extraction hashes, locations and private reference findings remain auditable. Existing `tests:approve` requires explicit human decisions and rechecks Level 2 sources before promotion. The verifier receives only approved gold and sends only testimony to the app, never the reference analysis. Both original documents and extracted text must be reviewed for PDF reading-order issues. Keep real testimony in gold private too; inspect it before committing or publishing.
