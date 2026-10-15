# Long-document regression fixtures and expected results

Run from the repository root:

```sh
node --test tests/long-documents/workflow.test.mjs src/lib/*.test.js
node --test server/scoring/*.test.js server/chronoTime.test.js server/sourceEvidence.test.js
npm run build
```

To create the same kind of full-size PDFs for manual UI testing, run `node tests/long-documents/generate.mjs`. It writes two fictional 225-page PDFs and `EXPECTED.md` under the ignored `generated/` directory. Generating/uploading locally is not permission to start paid analysis; inspect and approve the UI cost preview separately.

These commands do not start local servers or make paid requests. All provider, storage and streaming responses in `workflow.test.mjs` are mocked/in-memory. `syntheticPdf.mjs` creates public, fictional fixtures in memory; it reads no author corpus, gold labels or verifier report. No existing tests or labels are replaced.

## Fixtures and required outcomes (expectations, not observed results)

- **225 PDF pages**, over 2 MiB and 500,000 extracted characters: all 225 pages, questions, answers, exact page offsets and PDF labels 101–325 survive. Both complete documents enter an all-section-pairs plan; joining core ranges reconstructs every character exactly.
- **Blank/scanned and damaged pages**: page numbers stay in the manifest with OCR_REQUIRED/READ_ERROR. Complete paid analysis is blocked, rather than silently skipping those pages. Original file storage is separate from extracted text.
- **Distant/reordered lease statements**: one appears near the beginning of document 1 and the other at the end of document 2. Every section combination is submitted to the mocked model, including this distant pair. Expected synthetic type is DIRECT (affirmation versus denial); no numerical calibration target is asserted.
- **Duplicate findings**: same exact quote pair, literal fields and category combine across section calls, preserving exact quotes, source offsets and explanation variants. Different categories remain separate for review. No fuzzy semantic merging or averaging scores.
- **Response failure/truncation**: a completed comparison survives another comparison's failure. Result is partial (or failed when none complete), tasks expose errors, malformed candidates remain in task diagnostics, and there is no retry or extra paid call.
- **Cancellation**: active signal reaches the mocked provider, remaining calls never start, and status is cancelled. Interrupted client streams cannot report completion without a final result event.
- **Budget and consent**: preview makes zero model requests. Mismatched plan approval cannot start analysis. Existing short `/api/analyze` retains the single-call request/response contract. Multi-request legacy calls receive 428 and an explicit plan instead of spending silently.
- **Persistence**: PDF metadata and partial/cancelled status fit the existing case JSON columns. Legacy cases without new fields continue to load and save. No ownership or row-security changes.
- **Upload**: 50 MiB application ceiling, original bytes intact, authenticated fixed 6 MiB TUS chunks and cancellable transfers. Bucket/global restrictions still apply. Synthetic credentials exist only inside mocks.

Passing these checks establishes transport/coverage/provenance behavior under fixtures. It does not establish live model recall, real deposition accuracy, hosting capacity, provider access or calibrated scoring. Actual checks run and remaining limits are recorded in `docs/long-depositions.md`.
