# Isolated author workflow

All paths below are relative to the repository root. No app or verifier source, output, or report is needed by these tools.

## Choose Level 1 or Level 2

The existing `$deposition-test-author` skill supports both workflows in a fresh author-only context. Level 1 uses the unchanged synthetic generator and seeds. Level 2 imports two saved testimony documents plus a separate lawyer/judge analysis; see [LEVEL2.md](LEVEL2.md) and [LEVEL2_PROMPT.md](LEVEL2_PROMPT.md) for exact source/proposal contracts. Importing or checking tooling does not generate or approve cases.

Level 2 entrypoint: `npm run tests:author:level2 -- --help`. The existing `tests:level2` alias remains valid. Use `prepare` to preserve originals, exact extraction, citations and hashes; use `generate` to call Claude on the separate source snapshots and append validated draft tests, or `append` for proposals authored in the isolated Codex chat. `generate` is an explicit paid operation, with preserved raw responses and no automatic retries. Never use the Level 1 `--replace` path to append real-world cases. Reference findings stay author-only, outside detector inputs and the approved gold handoff. `npm run tests:approve` displays those separate findings and requires explicit human decisions before promotion, rechecking sources first. Existing synthetic review behavior is unchanged. The verifier receives only approved gold and never reads the private bundle.

The preview and generation history below describes earlier Level 1 development; it does not assert the current approval totals. Do not overwrite current tests based on this historical account.

The original 30 independently written suggestions are preserved unchanged in `archive/prior-handcrafted-preview.pre-interface-contract.json`, with explicit ineligibility metadata alongside it. They predate the score-band interface contract and mandatory coverage tags, are not Claude output, and must not be used as gold. The original `tests/gold.draft.json` remains unchanged until the coordinator runs the author with `--replace`; tightened schema validation prevents approving this invalid preview. No entry has been approved. The six exact source-input seeds in `seeds.json` are isolated issue pairs with their actual question context, not complete deposition reruns. Expected-result definitions and generation coverage are in `AUTHOR_PROMPT.md`. No implementation results were used to author the preview.

Interface contract: IDs contain letters, digits, underscores, and hyphens only. `expected_score_band` is null exactly when `expected_evidence` is `NOT_EVALUABLE`; evaluable compatible cases use a real band (`WEAK` for clearly compatible pairs), independent of a separate compatibility index. Generated arrays must include all twelve literal coverage tags listed in `AUTHOR_PROMPT.md` within `tricky_feature`; no extra schema field was added.

Generate a new Claude draft from the prompt and seeds:

```sh
node tests/author/author.mjs
# An existing draft requires explicit replacement; a successful replacement archives it first:
node tests/author/author.mjs --replace
# Optional explicit provider-default opt-in for other model overrides:
node tests/author/author.mjs --replace --provider-default-temperature
# Revalidate a preserved provider result without another API request:
node tests/author/author.mjs --replace --resume-run 2026-10-14T19-49-23.450Z-2074
```

The script loads `dotenv/config` and the existing `@anthropic-ai/sdk`; install/configuration and API credentials are the coordinator's responsibility. It defaults to `claude-opus-5-5` and supports `TEST_AUTHOR_MODEL`. For the default model, known API capability selection omits temperature **before the call**, records `temperatureMode: "known-deprecated-provider-default"` and `temperatureRequested: null`, and loudly logs provider-default behavior. This capability comes from the observed provider HTTP 400: "`temperature` is deprecated for this model." Other models request `temperature: 0` unless the coordinator explicitly passes `--provider-default-temperature`, which records `temperatureMode: "provider-default-explicit"`. The chosen model capability, evidence, reason, and API parameters are stored in request metadata. SDK retries are disabled; there is no automatic retry, parameter fallback, or silent removal after a failure. Existing historical request records and resumed temperature modes remain unchanged.

Raw response JSON/text, request metadata, and any errors are retained under `runs/`. Strict parsing and schema/seed validation must succeed before a draft is replaced; there is no fence stripping, JSON repair, missing-seed insertion, relabeling, or case dropping. The generation path never reads approved gold.

Known SDK `thinking` and `redacted_thinking` blocks are allowed as provider envelope metadata; only exact `text` blocks are concatenated as the strict JSON source. The full raw envelope is preserved, content block types are recorded, and unknown/tool/image blocks fail validation. This never strips fences or repairs case data. `--resume-run <stamp-or-directory>` explicitly reuses raw-response.json and raw-text.txt from a directory resolving inside this author's runs root; their text must match exactly before the same full schema, seeds, count, and coverage validation runs. Resume makes no API call and preserves the source request and temperature mode in its result metadata. It cannot be combined with a new temperature flag. The coordinator must still pass `--replace` to replace an existing draft.

Review in an interactive terminal:

```sh
node tests/author/approve.mjs
node tests/author/approve.mjs --ids sample-home,sample-sleep,sample-food,sample-neighbor,sample-warehouse,sample-knowledge --reviewer "Human name"
```

Each case displays both complete transcripts, every proposed label, its feature, and rationale. The reviewer explicitly chooses `a` (approve), `e` (edit a full strict JSON object), `r` (reject), or `q` (quit). Editing requires a subsequent explicit approval. Input piping is refused. An approved entry gets explicit human-review provenance and is copied to `tests/gold.json`; rejected entries remain in the draft with status `rejected`, and pending entries remain `draft`. Individual review events, including rejected content and edits, are retained under `reviews/`. Existing approved content with a divergent duplicate ID cannot be overwritten by acceptance: the reviewer must explicitly edit the draft ID or make its reviewed content identical. Identical existing approved content retains its original provenance.

Files are replaced atomically, and prior drafts are archived before API replacement. Multi-file gold/draft updates are not transactional: a failure after saving gold can leave a pending draft alongside its approved gold entry, with an approval-intent event retained for recovery. Restarting review recognizes identical gold without silently changing it. Concurrent changes detected during review stop the session. Do not run concurrent approval sessions.

Author helper and fixture checks (no app execution, API call, or approval):

```sh
node --test tests/author/schema.test.mjs
```

## Explicit owner batch approval

`node tests/author/batch.mjs --decision path/to/decision.json` saves a previously authorized owner decision without prompting per case. It does not infer approval: the decision must identify the AI reviewer, owner, approval date and exact approval source, and partition every existing draft-file ID into `approved_ids` or `draft_ids`. `type_only_ids` must be a subset of approvals. Updates may change proposed evidence, code-support audit or review policy; transcript, type, rationale and band changes are refused. Fresh generated cases still use the strict draft-only schema and original evidence enum.

Batch entries distinguish AI review from owner approval. Type-only approvals make evidence informational; every batch band is informational and retains its existing value. Evidence and null-band constraints remain required for full evidence approvals. Only `sample-home` can retain pre-existing explicit human review and human verification, with the previous review saved in the audit.

Each exclusive `reviews/<batch_id>/` archive contains the literal original gold and draft files, the decision, a complete before/after plan and a progress journal. Files are replaced atomically one at a time. An interruption can leave one replacement completed: inspect `progress.json`, `plan.json` and the original snapshots before recovery. Reusing a batch ID is refused, and detected concurrent changes stop the commit. Do not run concurrent writers.

Run author workflow tests with `node --test tests/author/schema.test.mjs tests/author/batch.test.mjs`; batch tests use temporary synthetic fixtures inside the author directory and do not call a model or application API.
