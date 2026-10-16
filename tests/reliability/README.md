# Local reliability checks — fictional fixtures, no AI spending

Run `npm run tests:reliability` and `npm run tests:load`. Both run without a listening server. The provider is a local stub, not a remote model.

Expected behavior:

- An interrupted process leaves a readable checkpoint containing both complete fictional source texts. Only successfully checkpointed work is guaranteed. Kill-worker test uses SIGKILL after the first durable checkpoint; restarting the store reports interrupted, not complete.
- Different users cannot recover/cancel/delete each other's jobs. Production configuration requires authentication, an allowlist and a private persistent directory.
- Invalid JSON, oversized requests, an expired session and concurrency overload never reach a paid provider. Cancelled/hung calls stop; capacity is released after errors. Checkpoint-write failure prevents the next paid request and preserves the earlier atomic record.
- Resume skips completed pairs, keeps prior accepted findings and attempt history, and requires the same source/plan/rules. Code changes and estimate ceilings refuse work before calls. Completed runs cannot be paid for again through resume.
- File references, question/answer context, notes matched to finding identity and partial statuses survive recovery. New analysis clears old results; resume retains relevant prior results. Recovered documents are not silently replaced with extraction-only metadata.
- Old dates do not carry into a current CFO question or a separate lease topic. Explicit nearby same-event follow-ups can retain a named day. Habitual/idiomatic would is distinguished from conditional would; if/unless and uncertain hypotheticals stay unscored.
- The 100-attempt mock load run uses five waves of twenty simultaneous users: one per wave is admitted, nineteen are rejected with overload status, no unexpected error, all capacity released. Rejection is not a successful analysis. Mock p50/p95 timings do not predict provider or hosting performance. JSON and printable HTML output are written separately under tests/report/reliability/.
- Logs never include fixture testimony or credentials. Model/prompt/code identifiers and raw model text are in private analysis records, not ordinary logs.

These are implementation regression expectations, not gold labels or detector accuracy measurements. No author files or verifier output is used by these tests. Existing short-document, page-coverage, scoring-invariance and PDF tests should still pass.
