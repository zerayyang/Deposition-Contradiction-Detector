# Part 1: general source-linked event records

This is an isolated module, not a replacement analysis engine. The existing app,
model prompt, presence prototype, classification definitions, numeric scoring,
Supabase storage, author/verifier workflows and hosting configuration are unchanged.
No application module imports this validator yet.

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

The caller supplies `{documentId, text, pages?}` to `validateEventBundle(bundle, source)`.
Results expose all errors and per-event validity; the input is never changed. `valid`
means structurally/source valid, NOT semantically correct. Use the original text, not
normalized/re-extracted text. Page-map integrity should first pass the existing PDF
manifest validator. Known named-speaker parser limitations remain visible rejections.

Part 2 can connect a model extractor and extend source parsing. Event matching,
comparison, confidence changes, database migrations, feedback, retrieval memory and
paid evaluation are outside Part 1. The current presence regex is retained as a
checkpointed prototype; do not expand it into a hardcoded taxonomy or delete working
production logic before a replacement passes independent checks.
