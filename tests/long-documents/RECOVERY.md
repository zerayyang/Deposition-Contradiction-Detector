# Analysis recovery checks

Run `node --test tests/long-documents/recovery.test.mjs` or `npm run tests:documents`.
These synthetic cases call a mocked provider. They create no gold cases, start no
listeners, and do not contact Claude. Their expected behavior is transport/source
validation, not a numeric confidence target or a classification calibration.

Expected checks:
- Repeated PDF line numbers and reporting timestamps may be mapped to exact raw
  source spans. Both model wording and mapped wording/offsets remain auditable.
- A changed word, case, punctuation, negation, ambiguous occurrence, or occurrence
  outside the submitted section is not repaired into an accepted quote.
- Isolated amounts and time expressions are not removed as reporting metadata.
- One invalid candidate cannot discard another valid candidate. Retain the valid
  result and the rejected candidate/reason; coverage is partial, never complete.
- A grounded quote uses its original PDF page label and passes the existing witness
  evidence validator. Questions still cannot serve as witness answers.
- Short inputs retain the 10,000-token budget. Sectioned inputs reserve 32,000
  output tokens including thinking. Preview costs and plan approval hashes reflect
  that change. Sectioned provider requests have a cancellable 10-minute timeout; short-request timeouts remain unchanged. No extra retries or automatic continuation calls are allowed.
- Output exhaustion remains failed, with raw output, stop reason and per-task
  token usage retained. Missing output is never parsed as a complete result.

Production scope: `server/pdfQuoteGrounding.js` is an exact offset map with a
restricted layout-only lookup, not fuzzy semantic matching. It runs only for PDF
manifests already checked against the source digest. It recognizes runs of at
least four consecutive printed line numbers (1–25); repeated reporting timestamps
are removed only on at least four such numbered lines per page. Whitespace is
normalized for lookup, but source display, literal fields and citations use exact
raw substrings. Unsupported layouts fail visibly. Footers, arbitrary numbers,
words and punctuation are not stripped. Scoring functions and category definitions
are unchanged. Layout interrupting a literal fact can still make it unscorable.

Partial tasks expose `acceptedFindings`, `rejectedFindings` and their reasons.
`analysis.partial` advances the progress bar without crediting full coverage.
`tasks[].response` preserves original model candidates for rejected or mapped
responses; `sourceGrounding` records mappings on findings. Reports/replays should
use these audit fields and must not describe offline success as live AI accuracy.
The legacy short endpoint retains its findings response and also exposes analysis
metadata; it uses the same source-validation path as streamed analysis.

The provider's documentation states that adaptive thinking and answer text share
`max_tokens`: https://platform.claude.com/docs/en/models/opus-5-5/migration-guide
A larger budget reduces a known exhaustion risk; it does not guarantee completion.
Actual cost and latency remain unmeasured until a separately approved live check.
