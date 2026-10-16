# Reading diagnostics and complete-with-gaps policy

## Scope
Local implementation only. No model/provider calls, deployment, commit or push.
Existing gold files, approved-case labels, classification instructions, numeric
scoring behavior and `validate.js` citation acceptance rules are unchanged. The
explicitly approved test setup and expectation updates were applied. New synthetic
tests are separate. No real testimony was used in the new fixtures.

## Citation rejection codes
`materializeExtraction` preserves its strict original rejection conditions and raw
proposed records. Dedicated codes identify VERBATIM_MISMATCH,
OCCURRENCE_REQUIRED, OCCURRENCE_MISSING, UNAVAILABLE_SOURCE_UNIT,
NO_WITNESS_QUOTE_IN_CORE, DUPLICATE_EVENT_ID, DUPLICATE_SOURCE_ID,
FORBIDDEN_SCORE_ATTRIBUTE and INVALID_EVENT_SCHEMA. Existing downstream validation
codes remain available. UI error text maps codes to plain language.

Each rejected record may carry `reportDiagnostic`: model quote and nearest source
preview, each limited to 60 Unicode characters, with common email/long-number/token
patterns redacted. Nearest text is a heuristic diagnosis, never a corrected or
accepted citation. Diagnostics are absent from UI projections, friendly errors,
gap explanations and logging fields. Only the private saved report renderer shows
the previews. Redaction is not full anonymization: names or other private words
may remain. Keep reports private; the existing diagnostic download also contains
original source inputs and raw responses.

## Input boundaries
SOURCE, CITATION, EXHIBIT, NOTE, FOOTNOTE, SEE and Dep. citation lines are OTHER
metadata boundaries. They are not named witnesses or selectable speaker labels.
Original characters and offsets are preserved.

Both direct and event planning reject unlabeled prose unless the caller submits
explicit user confirmation, separate from same-witness confirmation. The UI binds
that checkbox to the exact input text. Q/A syntax and explicitly reviewed named
witness roles retain their structured-source behavior. Confirmation does not turn
metadata into testimony: if no usable witness span exists, extraction still stops.
The low-level legacy source validator is unchanged; confirmation is enforced before
analysis entry points can use its unlabeled fallback.

## Reading state and gaps
- Valid NO_EVENT accounts for an answer. It does not prove no event occurred.
- Valid UNRESOLVED accounts for an answer with a visible interpretation gap. It
  does not create a failed/PARTIAL chunk by itself.
- Invalid records and invalid dispositions still make a chunk PARTIAL. A known
  failed response makes it FAILED. Subsequent unattempted chunks continue under
  the already approved budget, including across fresh hosted instances.
- Raw failed/partial chunks are retained and locally replayed, never automatically
  retried. Starting a new reading/retry requires fresh explicit cost approval.
- Once every chunk has a terminal outcome, gaps yield READING_GAPS only
  if at least one MODEL chunk passed validation (including valid NO_EVENT or
  UNRESOLVED dispositions). With no validated chunk, retained valid notes yield
  PARTIAL; no validated notes yield FAILED. Local metadata-only chunks cannot
  turn failed model reading into successful reading.
- Document coverage separately reports COMPLETE, PARTIAL or FAILED from its
  processed ranges. A document with no fully processed chunk has FAILED coverage
  even when another document validates and the overall run is READING_GAPS.
  The gap list retains document, assigned range and reason; accepted notes survive.
- Saved COMPLETE chunks must pass strict cached-response validation before gap
  acknowledgement or comparison planning. Only saved PARTIAL/FAILED chunks use
  retained-gap replay; corrupt completed records cannot be downgraded to gaps.
- Cancellation, unknown in-flight claims, persistence failures and an exhausted
  spending allowance still stop further work. No automatic retry bypass exists.

`readingPolicyVersion:2`, `readingFinished`, `gaps` and `gapDigest` distinguish the
new lifecycle from old snapshots. A shared pure policy keeps cloud `final()` and
the browser resume decision aligned. Old snapshots keep their old conservative
resume behavior until a fresh plan is explicitly approved.

## Comparison gate
The server rebuilds the extraction plan and revalidates raw saved outcomes. It
rejects unfinished reading, missing acknowledgement or a stale gap digest before
any comparison transport can start. The user acknowledges the actual current gap
list and separately approves comparison cost. No validated notes in either source
blocks comparison with a useful message. Even after every comparison finishes,
upstream gaps remain marked incomplete; they never become “complete evidence.”

## Verification
Use only these affected tests and changed-file lint. No build or live run is needed:

    node --test tests/events/rejection-codes.test.mjs tests/events/reading-gaps.test.mjs tests/events/brief-input.test.mjs src/lib/analysisStatus.test.js src/lib/reviewReport.test.js tests/deployment/cloud-storage.test.mjs

The synthetic three-chunk fixture has partial, failed and successful chunks. Tests
cover exact retention, no repeats across hosted instances, explicit gap approval,
source-role safety, report-only previews, budget blocking and cancellation.
The explicitly approved test setup and expectation updates were applied, retaining
all other assertions. They reflect valid UNRESOLVED dispositions, continuation past
failed chunks, strict completed-cache replay and incomplete-coverage reporting. A
focused mocked pass does not establish live extraction accuracy.

## Incomplete-reading display
The local uncommitted gap status is now READING_GAPS (reading_gaps after a
finished partial comparison). It never means complete document coverage.
Results, acknowledgement, saved findings and reports show Reading incomplete—review
required, with each document's validated/partial/failed MODEL chunks and retained
note counts prominently visible. Compare retained notes only remains visible after
acknowledgement and comparison. Unread or unvalidated ranges may contain
contradictions; no findings in retained notes does not establish their absence.
