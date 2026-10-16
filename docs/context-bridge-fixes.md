# Functional follow-up: context, directness and open event attributes

The production code at a720ab0 deployed successfully. Supabase Stages 6–8 were then
installed by the user: schema-only checks found all four tables, owner-scoped retrieval
returned zero lessons, an authenticated memory-enabled plan returned 200, anonymous
retrieval was denied, and the hosted Corrections inbox loaded without a storage error.
No real corrections, approvals, lessons or saved cases were created by these tests.

## Defects fixed locally after that deployment

1. Necessary versus optional context: the model listed destination/return/duration
   follow-ups as required missing facts even for a source-supported comparison unaffected
   by those details. Comparison instructions now distinguish necessary identity/scope/
   incompatibility information from optional follow-ups. Real uncertainty still gates scores;
   no response fields are auto-cleared or source validators weakened.
2. Directness versus timeline instructions: the canonical directness and inference
   paragraphs conflicted about explicit exhaustive assertions and directly stated exceptions.
   Their precedence is now consistent with the user's intended scope policy. Membership in
   the same occasion/scope must come from testimony; separate supported range/timeline
   inference stays INFERENTIAL. No fixture/person-specific answer is in the prompt.
3. Open event attributes versus fixed scoring fields: a source-valid signing event had
   custom actor/document/occasion attributes and no attribute literally named activity.
   The old bridge therefore supplied no activity, despite clear literal signing statements.
   It now reuses the existing supported activity grammar on a complete validated witness
   answer. Cropped answers, multiple sentences, compounds, conditions, reported speech and
   purpose clauses cannot activate this fallback. Event kinds remain open; no new numeric
   rule, formula, threshold or model-supplied confidence was added.

## Evidence from this follow-up

- Broad final local regressions: 363 checks; see the run log for actual completion.
- Independent verifier self-checks: 38/38 passed; paid approved-gold checks did not run.
  Automatic approval review requires explicit transmission permission for those saved cases.
- Paid integration work used fictional implementation fixtures only, not gold/author data.
  Initial failures were retained. Targeted rechecks followed specific local changes.
- The scoped home/departure pair progressed from INFERENTIAL/unscored to code-supported
  conflict, then DIRECT/code-supported conflict after instruction precedence was aligned.
- A reordered three-topic run accounted for nine pairs and preserved three comparisons,
  including one suppressed identical-assertion card. The signing failure was fixed by
  replaying its unchanged raw output; a fresh memory-enabled comparison also supported it.
- Approximate overlapping clocks were compatible; a separate fresh approximate separated-
  clock test was INFERENTIAL with a supported conflict. These are small functional checks,
  not a deployment-readiness or 95% accuracy benchmark; stability was not measured.
- A positive memory cycle used an isolated PGlite database and scripted synthetic reviewer
  states, one real provider comparison and revocation. It is not human-verified production
  memory or an independent accuracy A/B evaluation. The hosted pool is still empty.

## Repeat locally without paying

```sh
node --test tests/events/context-necessity.test.mjs
npm run tests:events
npm run tests:feedback
npm run tests:memory
npm run build
```

Fictional inputs and proposed expectations are in tests/events/fixtures/. Never send the
expected-results guide as detector input or promote it into memory. Paid checks need a
fresh request/cost cap, no automatic retries, and preserved raw responses/failures.

## Safe commit point

The fixes below are local and not yet published. Exclude unrelated AGENTS.md, private
reports, author batches/reviews/archive, credentials and any production data.

```sh
cd '/Users/zerayyang/Desktop/Deposition Contradiction '
git add -- server/events/COMPARISON_PROMPT.md server/events/scoringAdapter.js \
  server/proper_prompts.md server/scoring/rules.js \
  tests/events/EXPECTED_RESULTS.md tests/events/context-necessity.test.mjs \
  tests/events/fixtures/functional-smoke.json \
  tests/events/fixtures/functional-smoke-expected.md \
  tests/events/fixtures/approximate-separation.json docs/context-bridge-fixes.md
git --no-pager diff --cached
git commit -m "Fix event scoring projection and clarify comparison context"
```

No commit/push/deployment is performed by providing these commands. Push/redeploy only
after reviewing the staged changes. Existing Vercel function duration/body limits still
apply; this work does not establish that arbitrary large depositions finish successfully.
