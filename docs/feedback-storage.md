# Stage 6 — correction and independent approval storage

This is the storage foundation, not model training. The detector never reads these
records during analysis in Stage 6. No prompt, numeric score, saved AI result,
author draft, gold label or verifier artifact is changed by feedback. The visible
Review & Improve submission/reviewer UI is scheduled for Stage 8.

## Separate records

- `finding_feedback`: append-only proposals tied to a saved case/finding, original
  result snapshot, original transcript hashes, provenance, proposed category and
  explanation. Revisions create a new proposal pointing to the prior one.
- `feedback_decisions`: append-only approvals, rejections, context requests and
  revocations. Authenticated reviewer identity, timestamp and sequential revision
  are recorded. This is an account action, not an automatic human-verified label.
- `approved_feedback_examples`: historical private examples created atomically
  with approval. Revoked rows remain history; they are not currently approved.
- `feedback_private.reviewer_assignments`: administrator-managed permission for a
  separate account to review a particular owner's feedback. No self-assignment API.

Submission requires ownership of the saved case and equality with the displayed
saved finding. The database copies the snapshot; the caller cannot supply an owner,
approval state, numeric target or approved lesson. Literal quotations must occur in
both saved inputs. This checks text presence, not named witness roles or meaning.
Saved results are owner-editable: snapshots do not cryptographically attest provider
origin. Approval therefore requires an independent account's explicit source check.

## Approval and privacy

Repeated submissions never count as votes and never cause approval. A request UUID
makes identical submission retries idempotent; reusing it with different content
fails. There are no automatic retries in the client. An assigned reviewer cannot
approve their own or their owner's own submission as that same account. An owner
cannot assign themselves through the app or editable user metadata.

A reviewer must confirm source review and supply the latest decision ID. Stale or
double decisions fail rather than overwrite history. Only one correction on a given
case/source/result snapshot can be currently approved. Revoke the old approval
explicitly before approving another. An advisory transaction lock serializes target
approvals. A private current-approval index enforces a unique owner/target key as
well, so stale transaction snapshots cannot insert two current approvals. Independent
production concurrency testing is still advisable.

RLS limits reads to the owner and their assigned reviewer. Anonymous users have no
access. Browser roles have SELECT only, not direct INSERT/UPDATE/DELETE. All writes
use narrow RPCs with explicit authorization, a fixed empty search_path and revoked
PUBLIC/anon execution, following the official guidance:
https://supabase.com/docs/guides/database/functions
https://supabase.com/docs/guides/database/postgres/row-level-security

Reviewer assignment grants access to that owner's feedback snapshots, which may
contain private quotations. Provision only an explicitly authorized independent
reviewer; no assignments are created by the migration. Removing an assignment
immediately removes read/review access, but does not revoke past approvals: revoke
those separately if needed. Database administrators remain trusted and can edit data.

Privacy scope is OWNER_ONLY. There is no global knowledge pool or automatic sharing.
Deleting a case cascades its feedback, decisions and examples, including revisions.
Historical results remain intact while the case exists. Reviewer-account deletion
clears its foreign-key identity without erasing decision history.

## Installation — not performed automatically

1. Review `supabase/migrations/20261015_feedback_approvals.sql`.
2. Apply it once as administrator in the Supabase SQL Editor or migration workflow.
   It creates new tables/functions/policies; it does not rewrite existing cases.
3. Assign an authorized separate reviewer only when ready, using administrator SQL:

```sql
insert into feedback_private.reviewer_assignments(owner_id, reviewer_id)
values ('OWNER_USER_UUID', 'SEPARATE_REVIEWER_USER_UUID');
```

The two placeholders are different existing Supabase Auth user IDs, not passwords.
Never place a service-role key in the browser. Self-approval is deliberately unavailable
for a one-account demo; use a separate authorized reviewer account.

## Client and later integration

`createFeedbackStore(authenticatedSupabaseClient)` in `src/lib/feedbackStore.js`
provides submit, review, permission checks and explicitly paginated audit reads.
Callers supply a UUID per submission, the exact saved finding and its index. Save
case changes first; stale content is refused. The original result is never updated.
A missing migration produces an explicit error. Application initialization/analysis
imports no feedback data, so an unapplied migration does not break the existing app.

`activeFeedbackExamples` is an audit helper, not production memory retrieval. It
requires a caller-confirmed complete decision history so a partial page cannot hide
a revocation. Stage 7 must perform current-approval checks server-side, respect owner
privacy, filter evaluation material and revalidate example sources before retrieval.
Stage 6 has no production-memory reader, training job, votes or model-weight update.

## Checks and practical limits

Run `npm run tests:feedback`. PGlite is a development-only in-process PostgreSQL
engine: the migration and SQL permissions execute with synthetic Supabase roles and
fictional records; no network listener, provider call or real account is required.
These tests cover actual SQL grants/RLS/RPC behavior, not a hosted Supabase/PostgREST
or JWT integration check. They do not prove multi-session advisory-lock contention.
The local test fixture is a bootstrap subset of the existing cases/auth schema.

All fixtures are implementation tests, not approved author gold or calibration.
Their scripted original category is DIRECT; proposed FALSE_POSITIVE/INFERENTIAL
changes exercise approval history only, not a claim that those labels are correct.
Expected: owners can submit; separate assigned reviewers can approve after checking
sources; self/anonymous/unassigned access fails; repetitions stay pending; conflicting
approvals are refused; revocation preserves history; stale snapshots fail; case
removal clears private records. Numeric scores are not changed or calibrated.
