# Reading citation failure: diagnosis and local fix

## Actual saved failure
The two PDF.js extractions retained all 630 and 984 characters, all pages,
introductions, original reference footers and the omission marker. The saved
speaker maps classified `Source` as `OTHER`; the footer was not witness evidence.
The Q/A parser preserved one answer in the second-deposition excerpt and three
answers in the first-deposition excerpt, with governing questions and original
offsets. The first uploaded document was the second-deposition excerpt.

The saved provider response ended normally (`end_turn`), not an output limit or
transport failure. It cited the witness answer separately from its actual question,
but attributed an examiner-only belief phrase to a witness qualifier. Validation
correctly returned `QUALIFIER_NOT_LITERAL` at `/events/0/qualifiers/0`. Quarantining
that event left its assigned answer unsupported (`UNSUPPORTED_UNIT_EVENT`). The
hosted job stopped without a comparison; the other reading task was not attempted.

A second bug hid this useful detail: workflow summaries discarded nested validation
errors and substituted a generic rejected-record reason. The UI then presented
reading work as a failed comparison and defaulted retained counts to zero.

## Changes
- Generic extraction guidance explicitly forbids turning question wording into a
  witness qualifier, including short adopting Yes/No answers.
- Workflow summaries preserve structured rejection codes/paths and actual retained
  counts. Raw provider output remains available; no event is automatically repaired.
- Reading UI and printable reports explain the actual check and recovery. Older
  saved cases obtain details from their existing raw extraction audit without any
  new model call. Failure details open automatically for incomplete reading work.
- Recovery explains how to inspect sources/roles and obtain the diagnostic report;
  a fresh paid attempt requires cost approval. Partial extraction still blocks
  comparison.

Validation, source offset calculations, classifications and scoring are unchanged.
No original saved case, author/gold labels, or reference analysis was modified.

## Verification
406 local checks passed, including five focused exact-excerpt regressions.
Production build and changed-file ESLint passed. The actual PDFs were re-extracted
locally with the app's PDF.js helper, with no OCR/read errors. The unchanged saved
bad model response remains rejected. A separate valid mocked response processes
all four answers with exact offsets; this is not a live model accuracy claim.

Deployed to the existing production alias after explicit user authorization.
Live model test was initially blocked by automatic approval review, pending explicit
approval for the two excerpt texts, Claude destination, a separate Supabase test
case and a US$3 maximum. No new paid call had occurred at that checkpoint.

## Follow-up: review-cost authorization crash
The resume preview passed `{...req}` to the hosted loader. Express inherits its
`headers` getter, so object spread dropped it. The checkpoint store then attempted
`req.headers.authorization` on an undefined object. Keep the original request and
pass case/job route overrides as separate loader options. The event UI also now
uses the same resumable-job predicate as direct analysis: terminal failed/partial
jobs request a fresh approval instead of resuming an ended job. Unknown in-flight
jobs retain their recovery IDs. No access check or authentication requirement was
removed. A prototype-header regression reproduces the Express behavior and checks
request identity/headers survive, with zero extra model calls. The affected hosted
and event-workflow suites passed 32/32; changed-file lint/build passed.
