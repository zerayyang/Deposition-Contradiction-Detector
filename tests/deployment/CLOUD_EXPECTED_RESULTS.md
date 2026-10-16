# Hosted workflow fixtures: expected results

These fictional Q/A snippets test transport, persistence and source-validation wiring, not model accuracy or numeric calibration. They are independent of author drafts and approved gold.

Run `node --test tests/deployment/cloud-jobs.test.mjs tests/deployment/cloud-storage.test.mjs`.

- Direct comparisons must execute at most one new mocked provider request per step, retain completed work across server instances, and finish without repeating calls.
- Event extraction must account for both fictional Monday-evening documents. Comparison requires a separate approval and then retains the scripted DIRECT comparison. This is a supplied fixture expectation, not observed live model performance.
- Duplicate submissions, cancellation, exhausted budgets, timeouts and storage failures must prevent automatic repeated paid work. Pending results are unresolved, never passes.
- Invalid literal source fields must remain rejected by the existing validator. No fixture-specific answer is added to production logic.
- Private checkpoints must reject altered content, relocated signed records and changed signing keys. Ownership is checked before access; latest checkpoint order is numeric.

No live model calls, private testimony, labels or author records are used by these tests. Numeric confidence correctness and cross-run live model stability are not graded.

Source-warning resume regression: after one completed comparison with a retained source warning, the next step must process the next pair, keep the earlier task completed, retain its warning, and never create a previous paid attempt for it.
