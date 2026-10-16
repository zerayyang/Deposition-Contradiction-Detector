# Analysis reliability fixes

Completed comparisons remain completed even when their retained findings need source review. Resume keeps those warnings and their original raw responses; it proceeds to the next unprocessed comparison. It does not pay again to repair a source warning. Failed/partial requests still require explicit review; changed builds do not silently resume old jobs.

Direct comparisons request the existing classification and literal-claim JSON schema through the provider's structured-output API. Classification definitions and numeric scoring formulas are unchanged. A malformed, truncated or source-invalid response still fails visibly; no JSON repair, invented quotations or changed expected labels are used.

Event reading defaults to at most 8,000 source bytes and 12 assigned witness units per section, with a 32,768-token output allowance. All core ranges remain contiguous and complete. More small requests can be needed than before: review the displayed plan and budget; a smaller spending allowance may stop with partial coverage. The hosted request allowance is 512, while explicit per-job spending approval remains necessary. Full event comparison cost is not known until reading finishes. No model or parser can guarantee semantic completeness from coverage alone.

Anthropic documents that Opus 5.5 always uses adaptive thinking and that max_tokens includes thinking plus visible output: https://platform.claude.com/docs/en/models/opus-5-5/migration-guide . Extraction pins medium effort and allows more output room; it does not attempt to disable thinking or weaken source validation.

PDF page metadata allows confirmed repeated filing/header lines in the first seven or final six lines of at least three pages to be treated as reporting furniture, not new speakers. Original text, quotations, offsets and page maps remain intact. Without a supplied page map, isolated headings remain boundaries. Form-only objections preserve an unanswered pending question; substantive interruptions and instructions still clear it. A model-supplied wrong question anchor remains invalid.

Local regression commands:

```
node --test tests/deployment/*.test.mjs tests/events/*.test.mjs tests/long-documents/*.test.mjs tests/reliability/*.test.mjs tests/feedback/*.test.mjs tests/memory/*.test.mjs server/*.test.js server/scoring/*.test.js src/lib/*.test.js
npm run build
```

Source replay checks measure whether the saved words bind to their actual witness context. They are not contradiction-type accuracy, numeric calibration or independent full-document recall tests. Live test results must be reported separately.
