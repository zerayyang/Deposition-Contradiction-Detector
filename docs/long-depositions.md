# Complete deposition uploads and analysis

## What changed

The 200-page and 500,000-character PDF rejections are removed. Extraction visits every page in order, retains Q/A line breaks and builds a character-offset page manifest with physical PDF page numbers and any PDF page labels. The original PDF remains a private, unchanged storage object. No text is shortened to fit a model call.

Blank pages stay in the manifest as OCR_REQUIRED; unreadable pages are READ_ERROR. The UI lists their page numbers, preserves the original and blocks analysis until a corrected/OCR PDF is uploaded. Sparse-text pages are individually identified for inspection. This is not an OCR engine: PDFs with mixed image/text content can still omit image-only testimony even if some text extracts. Inspect the original and OCR it when necessary. PDF reading order can differ from visual order. Physical page numbers are never presented as inferred printed transcript page numbers.

A PDF's extracted text and page map are hash-bound. Editing its text marks page references stale and blocks analysis until the corrected PDF is uploaded. Legacy cases without maps remain readable; their findings use text offsets, without invented PDF citations. Existing tables, ownership policies, classification definitions, deterministic scoring weights and author/verifier files are unchanged.

## Limits that now agree

| Layer | Application budget / behavior |
| --- | --- |
| Original PDF/TXT/MD | 50 MiB per file, no page-count cap |
| Extracted testimony | 12 MiB UTF-8 per document; oversize is an explicit error, never truncation |
| App HTTP JSON | 160 MiB, including JSON escaping and metadata; client checks encoded size too |
| Section | 240 KiB core UTF-8, 12 KiB local overlap, up to 24 KiB preceding full question |
| Single-call path | At most 480 KiB combined testimony, retaining the original one-call behavior |
| Long analysis | Cartesian product of both documents' sections, sequential, maximum 10,000 calls |
| Per model call | Existing 10,000 output-token budget, 240-second SDK timeout, automatic retries disabled |
| Runtime | One paid analysis at a time per server process; concurrent starts receive a visible 503 |

The model limits were checked against official documentation on 2026-10-14. The existing model remains `claude-opus-5-5`: 1M context tokens, 128K maximum output, standard uncached US $4 / million input tokens and $20 / million output tokens. This feature deliberately uses a smaller context/output budget; increasing a provider limit does not guarantee recall or shorter latency.

Sources: [Opus 5.5 specifications/pricing](https://platform.claude.com/docs/en/models/opus-5-5/overview), [Messages request size (32 MB)](https://platform.claude.com/docs/en/api/overview), [Supabase file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Supabase TUS uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

## Required Supabase setup (not applied automatically)

1. Apply the existing private-original bucket migrations first if needed.
2. Run `supabase/migrations/20261015_large_depositions.sql` through your normal migration deployment or SQL Editor. It only increases the private bucket file limit and preserves existing files/policies.
3. In Storage Settings, confirm the global file limit also permits 50 MiB; project quotas and plan restrictions still apply.
4. Browser imports use authenticated TUS requests with 6 MiB PATCHes, original bytes and no overwrite. No service-role key is added. Authentication, bucket restrictions and RLS errors remain visible. Upload cancellation aborts active fetches; unfinished TUS sessions can remain until storage expiry. A retry currently starts a fresh upload rather than resuming after reload.

No new package dependency is required. A `tests:documents` npm script was added. Case JSON columns now optionally preserve extraction maps and `results.analysis`; existing saved rows need no data migration.

## Workflow and API contract

- Upload both complete documents. The app saves source text, originals and extraction maps before analysis.
- Click **Review analysis cost**. `POST /api/analysis/plan` accepts `{transcript1, transcript2, documents:[{extraction,pageMappingStale}, ...]}`. It performs only local planning, hashing and cost estimates: no provider request, even token counting.
- The dialog shows both page/section counts, expected model-call count, estimated USD and a conservative budget. It explicitly asks you to start the paid requests. Estimates use UTF-8 bytes divided by three for typical input and 2,500 output tokens/call; the budget reserves bytes plus framing as input and all 10,000 output tokens, including thinking. This is not exact tokenization or a billing guarantee. Cancellation may not prevent billing for a call already sent.
- `POST /api/analyze/stream` takes the same body plus `approvedPlanId`. The SHA-256 plan binds source text, page maps, instructions, sections, prices and model. Changed inputs or stale approval receive 409 before model calls. Stream format is newline-delimited JSON: start, progress, checkpoint, heartbeat, result (or error).
- Every section of document 1 is compared with every section of document 2. No top-k search filter or corresponding-chunk assumption can silently exclude a section pair. Q/A boundaries are preferred, local overlap is included and a continued answer carries its preceding full question. Very long answers are split into contiguous covered ranges; all core ranges reconstruct the full text exactly.
- Model categories/definitions still come from the existing prompt. Scores still come from `assessCandidate` against the complete original extracted texts, using the unchanged deterministic rules. Quotations must belong to the submitted sections; malformed/out-of-section outputs produce visible failed tasks with returned candidates retained for inspection.
- Findings carry literal quotations, exact source offsets, all matching original page references and per-call analysis variants. Exact quote/field/category duplicates combine; categories are never averaged. Different types or literal issue fields remain separate to avoid erasing a distinct issue. Semantically duplicate paraphrased excerpts may therefore remain for human review.
- Legacy `POST /api/analyze` retains `{transcript1,transcript2}` and `{topicsReviewed,contradictions}` for single-call inputs. Multi-call inputs receive 428 plus a plan; they cannot silently start extra paid requests. The existing verifier's short-case interface is preserved. Prompt/scoring files and author/verifier isolation are unchanged.

## Completion, coverage, cancellation and failures

`analysis.status` is complete, partial, failed, cancelled or running. Complete means every planned request returned valid output and no source-validation issue was reported. It is not a claim of flawless detection. The manifest includes page/text ranges, each task's status/error, attempted/completed counts, duplicate count and returned token usage. A completed task means its submitted sections were processed; an empty findings list does not prove no contradiction exists.

Each successful section pair creates a checkpoint. A failed/truncated/invalid response does not trigger a retry or erase earlier findings. Remaining planned calls continue within the approved count, producing partial status if any fail. No paid retry or automatic output-budget escalation occurs.

The Cancel button aborts the browser request, propagates to the active SDK call and prevents remaining calls from starting. The UI retains its last received checkpoint, marks the run cancelled/partial and attempts to save it. An interrupted stream without its final result cannot appear complete. Database save failures are visible, with work retained in the tab for retry. Inputs and originals are saved before any paid request.

The current implementation is a browser-connected stream, not a durable background job queue. Closing the tab, restarting the server or losing the connection cancels/interrupts the run. Already received checkpoints are held in the tab and saved on normal completion/cancellation/error; they are not continuously committed during a browser/process crash. Original saved documents remain. Re-running requires a fresh cost preview and may bill completed comparisons again; selective paid retry is not implemented.

## Validation and remaining limits

Run `npm run tests:documents` for synthetic PDF/import/storage/streaming regressions. The fixture guide is `tests/long-documents/README.md`. The tests generate two actual 225-page PDFs in memory, each above the previous file and text limits, with differently ordered sections and a distant opposite-assertion pair. Provider/storage responses are mocked; no paid API calls, network storage operations or local servers are started.

Scoring regression command: `node --test server/scoring/*.test.js server/chronoTime.test.js server/sourceEvidence.test.js server/comparisonRules.test.js`. Build: `npm run build`.

Full Cartesian comparison trades request cost and time for explicit section-pair coverage. It can be expensive; always inspect the preview. Context that requires a chain across more than one section on the same side can remain unresolved. Overlap is finite, and a single very long quotation crossing a boundary may need manual review even though all source characters are covered. No model-recall or numerical-score accuracy is inferred from mocked tests.

No live provider, real Supabase upload, hosted gateway, browser interaction or load test was performed for this change. Hosting proxies must allow the documented JSON body size and long-lived unbuffered streams; a lower proxy timeout/limit must fail visibly. Large manifests/results use browser/server memory and database transfer quota. Project-level storage/database quotas are external constraints.

Start the UI and backend yourself from the repository root with `node start.mjs`, then open http://localhost:5173. Development-only UI remains `npm run dev`; it proxies `/api` to the backend on port 3000. This implementation task does not start either server.

## Checks actually run for this change

- `npm run tests:documents`: **40/40 passed**, including actual PDF.js extraction of two generated 225-page PDFs, complete page coverage, a page-1 versus page-225 mocked comparison, duplicate retention, failure paths and cancellation.
- Existing deterministic scoring/source/Chrono/comparison tests: **57/57 passed**.
- Existing transport-free verifier invariants (selected by test-name pattern): **2/2 passed**. The HTTP invariant was deliberately not executed because it launches a local server.
- Production build and ESLint on changed implementation files: passed.
- Prompt, deterministic rules/evidence modules and approved/draft gold hashes checked unchanged. No paid calls, local listeners, cloud migration or live storage writes were performed.
- Repeatable fictional upload PDFs: `node tests/long-documents/generate.mjs`; output includes its own expected-results guide. Browser interaction, live provider quality and hosted throughput remain untested.
