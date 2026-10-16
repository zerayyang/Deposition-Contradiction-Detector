# Stage 8: Review & Improve

## What the feature does

Open a saved finding and expand **Review & Improve**. Select a proposed category,
explain why, and submit. Save the case first. The original finding, explanation,
source references and deterministic score are not overwritten. A submission retry
reuses its request ID while its payload remains the same; repeated proposals are not votes.

The **Review & Improve** button beside Save case opens the corrections inbox.
Owners see their own proposals. Independently assigned reviewers see feedback they
are authorized to review, with explicit pagination. Select a proposal to read both
original transcripts and the frozen finding. A current source/finding mismatch blocks
approval, including a database check at write time if the case changed after loading.
Reviewers can approve, reject, ask for context or withdraw a current approval.
A decision changed in another session is refused; reload before retrying.

Approval does not release memory. An assigned reviewer may separately write a short,
general lesson and search phrases, attest it contains no private case/evaluation
material, and select **Release private lesson**. They can disable a released lesson;
withdrawing its source approval excludes it from retrieval as well. No model weights,
classification definitions, evidence rules or numeric scoring are trained or rewritten.
The attestation remains a human responsibility, not an automatic privacy/correctness detector.

## Setup and boundaries

Apply these migrations in order using the normal administrator workflow:

1. `supabase/migrations/20261015_feedback_approvals.sql`
2. `supabase/migrations/202610160001_approved_memory.sql`
3. `supabase/migrations/202610160002_feedback_review_sources.sql`

Assign a different existing reviewer account using the Stage 6 administrator procedure
in `docs/feedback-storage.md`. Owners cannot assign/approve themselves. The source-view
RPC grants an assigned reviewer access only through selected authorized feedback; it
does not grant general access to another owner's cases. Removing the assignment removes
future access. Data already viewed cannot be recalled. Review access therefore needs an
explicit administrator choice, never automatic assignment by the app.

These files are prepared locally; no migration, reviewer assignment, real correction,
approval or lesson release was performed by this implementation. Missing database
setup shows an error without changing saved findings or starting a model call.
The UI does not make paid calls when submitting, reviewing or releasing feedback.
Optional lessons enter only a separately approved comparison plan (Stage 7).

## Honest demonstration and evaluation

Run `npm run demo:memory`. This uses fictional testimony and a scripted model, with
zero network/provider requests and no real database writes. Expected results:

- One cross-document pair remains present in both modes.
- Both scripted classifications are DIRECT with valid source citations.
- Both deterministic scores are 90; a lesson cannot supply a numeric score.
- Only memory-enabled comparison receives one scripted approved lesson.
- Plan identity/input cost changes to include the lesson; request count stays the same.

This proves wiring and guardrails, not improved AI accuracy, speed or actual billing.
Fixtures and proposed lessons are implementation inputs, not approved gold or production
memory. Do not promote this example or author/verifier answers into the real lesson pool.

A real improvement claim requires a separate isolated verifier to use human-approved,
held-out cases with memory disabled/enabled, unchanged inputs/build/model, fresh cost
approval and an explicit request cap. Report missing/extra candidates, source validity,
category accuracy, numeric invariants and failures separately. Do not pick favorable
cases or change gold after seeing the output. The author must not see those results.
No such paid evaluation was run for Stage 8.

## Local checks

`npm run tests:feedback`, `npm run tests:memory`, and `npm run build` cover the
source-access RPC, stale approvals, client payload restrictions, latest-revision reads,
release declaration, pagination, UI rendering and existing memory isolation. Additional
offline browser interaction uses a fictional mock client; it is not hosted Supabase testing.
No new dependencies or hosted services are required. The new npm script is `demo:memory`.

## Reliability follow-up

The older one-request JSON endpoint again exposes ungrounded text candidates as
`reviewOnly`, NOT_EVALUABLE/null items, with empty source references and the rejection
reason. It retains the original rejection audit and partial status. Streamed/PDF source
grounding is unchanged; fabricated quotations never become verified findings. No fixture
or gold labels were changed to make the invariant pass.

## Observed local results — October 16, 2026

- Broad app regression suite: 358/358 passed.
- Independent verifier worker: 38/38 existing self-checks passed; no gold corpus run.
- Production build and changed implementation lint passed. Existing bundle-size warning
  and unrelated repository-wide scoring lint issue remain.
- Actual React browser interactions passed with a fictional mock client: submit, explicit
  source-checked approval, privacy-checked release, disable; four mock writes, zero network
  requests. Desktop 1440px and mobile 390px had no horizontal overflow.
- `npm run demo:memory` passed with mocked outputs: DIRECT/90 both modes, one pair each,
  no extra comparison requests, higher estimated prompt cost with the added lesson.
- Zero new paid provider requests during Stage 8. No live accuracy improvement measured.
- No commit/push, production migration, reviewer assignment or Stage 8 deployment performed.
