# Stage 5: website event review

The app now offers **Source-linked events** (default) and **Existing direct
comparison**. The old `/api/analyze`, `/api/analyze/stream` and plan API remain
compatible, including short inputs and independent verifier clients. Existing
saved results stay readable. Selecting a workflow makes no model request.

## User flow

1. Save a case and its two original sources as before.
2. Review speaker labels locally, assigning each mappable named label to witness,
   questioner or other. Court/officer and reserved Q/A labels cannot be reassigned.
   Titled names need review too; the program does not guess that a named person is
   the witness. Confirm shared witness identity only if personally checked.
3. Review the **extraction-only** request count and estimated/conservative USD cost.
   Approve explicitly. Every source core range is accounted for; missing or rejected
   work remains incomplete. Events and their literal sources are inspectable.
4. Complete extraction pauses at `awaiting_comparison`. It is not an analysis pass.
   Review the event records, then request a separate comparison plan and price.
   The comparison count cannot be known reliably before events exist.
5. Approve comparison. Every primary event block crosses every block in the other
   document. No keyword filter drops candidate pairs. Find outcomes in the existing
   findings pane, source context and printable review report.
6. The report also includes extracted events, suppressed comparison cards, unresolved
   matches and rejected-work summaries. Raw snapshots remain in private diagnostics.

Neither coverage nor COMPLETE means semantic recall or classification accuracy.
A reviewer cannot recover an event that extraction missed merely by checking the
returned categories. Live independent evaluation is still required.

## Numeric confidence boundary

`scoringAdapter.js` calls the existing `assessCandidate` and scoring engine without
changing formulas, thresholds, weights or category definitions. Only exact STATED
WITNESS_WORDS attributes named `activity`, `time`, `location`, `person`, `object`,
`quantity`, or `state`, tied to the selected source, enter those existing fields.
Other event attributes remain visible and do not become invented scoring rules.
Absent/conflicting mappings stay null. Qualifiers must occur in the same source.
Source-derived existing rules may independently recognize patterns in literal text.

Each side must have one witness quotation to obtain a numeric result. All additional
passages are retained, never stitched into a fabricated quotation. Unknown shared
identity, multiple named witnesses, missing context, unresolved relations/corrections
or disagreements gate the score to null. Source-valid does not mean semantically
true. The LLM never supplies numeric confidence. Supported numeric outputs remain
uncalibrated code evidence indices, not probabilities or human judgments.

## API

All routes use the existing authentication, rate limiting, admission control and
request-size boundary. They create no listeners on import.

- `POST /api/events/sources`: two transcript strings -> mappable speaker labels and
  source diagnostics. Local parsing only, no model or account lookup.
- `POST /api/events/plan`: `transcript1`, `transcript2`, existing `documents`
  manifests, `speakerRoles:[map,map]`, `sameWitnessConfirmed:boolean`,
  `phase:extract|compare`, `caseId`. Optional `eventState` resumes a saved snapshot;
  optional `eventJobId` loads its owned server checkpoint. Comparison requires a
  complete extraction snapshot. Returns phase, ID, new/cached request counts,
  estimated/conservative cost, model and recovery availability. No paid calls.
- `POST /api/events/stream`: same inputs plus exact `approvedPlanId`,
  `approvedRequestCount` and `approvedMaxUsd` from the current preview. NDJSON
  start/progress/heartbeat/checkpoint/result/error. Checkpoints retain existing
  `{topicsReviewed,contradictions,analysis}` shape. `analysis.workflow` is
  `events-v1`; `analysis.phase` identifies extraction/comparison.
- `GET /api/events/jobs?caseId=...`, `GET /api/events/jobs/:id`,
  `POST /api/events/jobs/:id/cancel`, `DELETE /api/events/jobs/:id`: owned local
  durable recovery only. Case deletion also deletes its event recovery copies.

`analysis.eventState` stores extraction/comparison raw-response snapshots, reviewed
speaker configuration and backend fingerprint. Existing Supabase case JSON carries
this state; no new table/migration is needed in this stage. Raw state includes
private testimony quotations; do not publish diagnostics or recovery files.

## Failure, resume and spending

On hosts configured with a persistent job store, atomic checkpoints are saved before
output and before the next provider request. A failed checkpoint stops further work.
The UI also saves received checkpoints through the existing private case store and
stops its connection on a failed cloud save. A request already in flight may be
billed. Cancellation does not guarantee a refund.

Vercel currently has no persistent job store: the UI says so before approval. Cloud
case checkpoints can be continued, but host termination before a checkpoint is not
recoverable as a completed response. Current Vercel duration limits are unchanged;
this stage does not solve long-running hosting. Large event plans may be refused by
existing request/USD caps; no source text is dropped to fit them.

Resuming rebuilds the immutable plan. Every completed cached raw response is freshly
schema/source checked before new work. All completed tasks restore before any new
checkpoint, avoiding loss of later completed work during replay. Derived accepted
arrays, supplied scores and offsets are not trusted. Changed source, roles or code
requires an explicit new run. Failed/partial requests need a new displayed approval;
there are no automatic retries. Remaining costs use actual remaining prompt bytes,
not average task prices. A zero-new-request resume makes no provider calls.

Browser-supplied snapshots are editable user input, not cryptographically attested
provider records. Revalidation establishes source/transport validity, not backend
origin or semantic truth. They are never approved training memory or gold labels.
Usage reports retain historical phase tokens, while `paidRequestsThisRun` counts new
transport calls; configured-rate estimates are not verified bills or Codex credits.

## Validation and scope

Run `npm run tests:events`, the existing document/reliability/deployment/source suites,
changed-source ESLint, and `npm run build`. New workflow checks use fictional inputs,
mock provider responses, temporary private storage and offline React rendering.
No paid model calls, app/server startup, private testimony, author drafts, gold labels
or verifier artifacts are needed. No classifier prompt, evidence rules, scoring
configuration, hosting, dependencies or database schema is changed.

No feedback, training, retrieval memory or automatic learning is added here. Those
are later stages requiring separate approval and independent evaluation.
