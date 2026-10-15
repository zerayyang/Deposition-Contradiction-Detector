# Protocol fixture expectations

The fixtures in `invariants.test.mjs` and `verifier.test.mjs` are isolated unit inputs, not gold labels, author examples or model-training data. Run `npm run tests:unit` from the repository root.

- Keeping validated testimony identical while changing model type, severity, reasoning or injected scores must leave deterministic score, evidence status, band and breakdown identical. The real HTTP transport test stubs the SDK and binds an ephemeral localhost port; no paid model call occurs.
- Distinct valid candidates and an ungrounded candidate must all remain present; the ungrounded candidate has NOT_EVALUABLE/null. The production server's existing byte-identical deduplication is an explicitly tested exception: two identical candidates become one. The live verifier never deduplicates observed responses.
- Exactly one well-formed, grounded, correctly scored candidate can pass a one-pair case. Empty output, extras, bad JSON, null JSON, missing fields, quote fabrication and injected scores must fail visibly. HTTP/network errors are ungraded availability diagnostics.
- Three valid identical contrary required type/evidence labels should be REVIEW, with a human-recheck message; errors and omissions must not masquerade as wrong gold labels. No test writes the approved gold set.
- Invalid and duplicate gold IDs fail before requests. Nonapproved rows are counted and shown but never sent. Three planned requests remain three attempts even when the network fails.
- Reports escape HTML in transcript inputs, show separate accuracy metrics and all attempts, and refuse to overwrite a timestamped raw archive on collision.

- Expected score bands are provisional. Band mismatches and band instability are informational. Type stability remains required.
- Evidence assertions remain required unless TYPE_ONLY approval scope explicitly marks evidence informational. Only that combination permits “depends on implemented rules”. Unchecked attempts are excluded from evidence accuracy; required successful HTTP attempts still include invalid or missing output in their denominator.
- Actual schema, grounding, score/status/null consistency, and deterministic provenance always remain strict. Expected or actual FALSE_POSITIVE may never receive positive CONFLICT_SUPPORTED scores; compatible indices remain permitted.
- Ordinal checks compare every valid exact and approximate score using explicit matching pattern/role metadata and a shared fired CONFLICT rule. Missing matches and invalid/unscored attempts produce SKIPPED reasons, never a default pass. Failures fail both applicable cases and the run.
- Reports preserve approval/review provenance but never infer human verification from approved status. Reviewer decisions start blank. Report generation time and immutable raw archives remain visible.

Verifier self-check: 19 verifier unit/invariant tests passed using local stub transport only. This does not establish live classification accuracy or numeric score calibration.


Availability gate: ECONNREFUSED aborts remaining requests immediately. Other transport/HTTP failures are retained; fewer than half of attempted requests succeeding makes the whole run NOT_RUN before normal reporting. The terminal and diagnostic report header say `NOT RUN: server unreachable (N/M requests failed). No accuracy results.` N/M counts failed/attempted requests, with unattempted requests shown separately. No accuracy, case pass/fail, or stability results are awarded in that run (JSON values are null); raw diagnostics and separate invariant observations remain archived. Exactly half succeeding does not trigger the ratio gate. In a completed but partial run, failed HTTP/transport requests remain ungraded and outside accuracy denominators; cases missing attempts are INCOMPLETE. A successful HTTP response with malformed JSON or bad app output remains a protocol failure, not an unreachable server. NOT_RUN exits nonzero, so automation cannot mistake it for a passing test.
