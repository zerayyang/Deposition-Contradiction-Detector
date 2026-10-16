# Part 7 fictional fixtures and expected results

Run `node --test tests/memory/*.test.mjs`. All records are invented inline; no app
listener, external network, model, author file, gold label or verifier report is used.

Expected tooling behavior (not measured detector accuracy):

- Private reader uses the requester's session and one owner-scoped RPC; anonymous,
  other-owner and reviewer-only production retrieval fail.
- An ordinary approved correction is absent until independent explicit memory release.
  Owners/unassigned users cannot release. Evaluation-material declarations are required.
- Same case/hash, edited source, disabled release and revoked approval exclude a lesson.
  Historical rows stay intact and direct deletion/forged writes are forbidden.
- Matching fictional search terms select a stable top three. Irrelevant and conflicting
  same-signature lessons are excluded; bounds and omissions are reported. Oversized or
  malformed pools fail closed. Changed content changes the snapshot.
- Memory off leaves the existing event task set unchanged; memory on increases prompt
  size/cost but never reduces current comparison coverage.
- Missing authorization, unavailable lookup or changed/revoked memory stops new calls.
  Old approval IDs cannot authorize a changed plan. Incomplete outcomes remain visible.
- Current citations cannot point at old memory IDs, and model-supplied scores are rejected.
  Numeric calibration is not tested or changed by these memory tests.

The SHORT general lesson text is a test of retrieval transport, not approved production
memory, a ground-truth detector label, or an example to add to the app prompt.
