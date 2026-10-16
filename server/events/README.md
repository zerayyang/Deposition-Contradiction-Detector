# General source-linked event records: Parts 1–3

This is an isolated module, not a replacement analysis engine. The model prompt,
presence prototype, classification definitions, numeric scoring formulas, Supabase
storage, author/verifier workflows and hosting configuration are unchanged. The
event extractor remains isolated from the active application analysis route.

- `schema.v1.json`: portable Draft-07 output shape; event kinds and attribute names
  remain open-ended. Sources, unknowns, assertion polarity, qualifier scope,
  corrections and coverage are explicit. No model-generated confidence is allowed.
- `validate.js`: strict, non-mutating structural validation plus existing witness-
  source checks, exact offsets/phrases, question bindings, page refs and coverage.
- `EXTRACTION_GUIDELINES.md`: general proposed extraction instructions, separate from
  production prompts and all example answers.
- `../../tests/events/fixtures.json`: ten fictional examples, including a new event
  kind accepted without extending production rules.
- `../../tests/events/EXPECTED_RESULTS.md`: companion expected outcomes and limits.

Run `npm run tests:events`. Ajv 6.15 was already present through project tooling;
this module declares it directly so its availability is not an accidental transitive
runtime dependency. No new package was downloaded by the offline lockfile update.

The caller supplies `{documentId, text, pages?, speakerRoles?}` to `validateEventBundle(bundle, source)`.
Results expose all errors and per-event validity; the input is never changed. `valid`
means structurally/source valid, NOT semantically correct. Use the original text, not
normalized/re-extracted text. Page-map integrity should first pass the existing PDF
manifest validator. Part 2 adds explicit caller-supplied speakerRoles and
sourceDiagnostics; see SOURCE_HANDLING.md. Unknown named roles remain rejections.

Part 2 source handling is documented in SOURCE_HANDLING.md. Part 3 adds an
isolated, approval-gated model extraction engine; see EXTRACTION.md.
The current UI and API still use the existing analysis workflow. Event matching,
comparison, confidence changes, database migrations, feedback, retrieval memory and
live evaluation are outside Parts 1–3. The current presence regex is retained as a
checkpointed prototype; do not expand it into a hardcoded taxonomy or delete working
production logic before a replacement passes independent checks.


Part 3 files: `extract.js` (lossless planning, spend approval, execution and progress),
`extractionProtocol.js` (strict wire schema, source materialization and dispositions),
`EXTRACTION_PROMPT.md` (dedicated general extractor instructions), and `EXTRACTION.md`
(interface, actual limits and validation distinctions). No new packages are required.
The prior general guidelines remain a design reference; the dedicated extraction
prompt is used only when a trusted caller explicitly executes this new engine.
