# Current combined score — experimental

Completed reviews now return EXPERIMENTAL with a numeric combined index in the ring.
The fixed-weight combiner runs in deterministic code: permutation agreement × 60 points;
reviewer agreement without concerns 20 points (with concerns 10; disagreement 0);
category-aligned deterministic code support up to 20 points, using rule strength for conflicts.
Code-supported compatibility earns code support for FALSE_POSITIVE. Contrary code earns zero.
Unsupported code is unknown and excluded: available denominator 80 instead of 100.
Score = round(100 × earned points / available points). Invalid sources or incomplete required
votes/reviewer still return no score. Analysis categories and old evidence scores are unchanged.

Example: 5/6 votes → 50; reviewer agrees → 20; full supporting code → 20; combined 90/100.
The percent sign is presentation of a 0–100 index, NOT a probability of correctness. Details
show every contribution and coverage. These explicit provisional weights are not statistically
trained. Supplied validated calibration coefficients remain a separate optional code path;
no trained artifact is configured. Human-approved examples are still needed for calibration.

# Hybrid classification confidence

Scope: confidence in the ORIGINAL returned category only. Discovery, classification, literal validation,
legacy evidence values and scoring functions are unchanged. Legacy API fields remain for saved-case
compatibility; the finding list/card now use the hybrid field for their main confidence display.

Two distinct qualified model identities each make three equivalent independent classification requests.
The independent reviewer sees the source context without original label or votes. Seven requests per
pair, no automatic retry. The injected orchestration helper remains available for isolated checks. Live UI integration uses
POST /api/confidence/plan (free) followed by seven POST /api/confidence/step requests (paid only
after the user approves the preview). Findings are reviewed one at a time automatically after analysis under a shared approved allowance.
Hosted steps use the existing authenticated private object store with immutable step locks and
results. A duplicate completed step returns its saved result without a new call. An uncertain
in-flight or interrupted step cannot be repeated automatically. Local development uses bounded
process memory and loses confidence job recovery on restart. No deployment has been performed.

The caller must supply validated original pair context, including governing questions and full answers,
and must revalidate source binding server-side. A browser-supplied verified boolean is not authorization.
The live handlers authenticate through the existing API middleware, verify exact witness quotations
and governing answers, recompute deterministic evidence features, preview/reserve seven calls,
and require explicit cost approval. Sources are kept in private storage, not logs or preview metadata.
The input is refused rather than truncated if the relevant pair context exceeds 40,000 UTF-8 bytes.
Plain prose without Q/A structure is refused by this small trial. No source boundaries are weakened.
Original finding categories and all old numeric evidence fields remain unchanged.

Experimental model pair: claude-sonnet-5-5 (three votes) and claude-opus-5-5 (three votes plus
independent reviewer). Official IDs/rates checked 2026-10-18 against
https://platform.claude.com/docs/en/models/overview. This is not benchmark qualification.
The two models share a provider and can make correlated mistakes. No logprobs requested.
Each step has a 45-second timeout and 2,048 output-token ceiling. Truncation/refusal/invalid JSON
stops the chain visibly. No automatic retries; in-flight cancellation may still incur charges.
The server limits a confidence plan to the lower of its configured budget and US$2. Rates and
UTF-8 input estimates are local assumptions, not verified bills. Missing usage reserves that
step's full budget; normal token usage is recorded. Completed votes save automatically with the finding; private hosted checkpoints are written after each step.
A request whose outcome was not received must be inspected before a newly approved paid run.
Statistical calibration fitting and evaluation remain unfinished; completed live runs now return an experimental combined index, with contribution details and
usage estimates. No claim of calibrated accuracy is made.

## Worked numbers (fictional, not observed model outcomes)

Three invoices versus five on the same day: original DIRECT. Five of six mock votes agree: 83.3%
agreement. Independent reviewer agrees. Validated-source gate passes; rule strength is 1.
Feature vector: [5/6, 1, 0, 1, 1]. There are no production calibration coefficients yet.
For arithmetic illustration ONLY, intercept -1 and weights [3, .5, -1, .25, .25] yield
z = -1 + 3*(5/6) + .5 + .25 + .25 = 2.5; sigmoid(z) = .9241, rounded 92%.
Those synthetic weights exist in a unit test only. They must NEVER be used as production calibration.
The current UI uses the separate provisional combined index above; the synthetic logistic coefficients are never used live.

Chicken versus chicken and salad: mock FALSE_POSITIVE, 6/6 agree; this is 100% agreement, not certainty.
Around eight versus around eight thirty with unclear event/period: mock split 3/6, reviewer objects.
These fictional examples appear in every finding card's hybrid-confidence panel, with no paid calls.
No real testimony, approved tests or reference answers are embedded.

## Expected results and limits

Run: node --test tests/confidence/*.test.mjs src/lib/scoreBadge.test.js
Expected: source failures block scoring; failed/missing/duplicate votes suppress final confidence;
reviewer failures remain visible; cancellation stops calls; original findings are unchanged.
All valid votes count equally, but agreement with the ORIGINAL category is the target, not majority
replacement. Same-model permutations are correlated; six votes are not six independent experts.
The calibrator is a logistic formula in code, not another LLM assigning a percentage. Human-approved
corrections supply calibration targets; evidence rule support/strength supply additional features.
Weights must be fitted and evaluated with document-grouped splits, sufficient class coverage and
versioned model/prompt identities. Reserve the fresh final heldout for final evaluation only.
This change implements coefficient application, not training, artifact signing or statistical evaluation.
Claude logprobs remain unavailable; no fabricated log probabilities. Missing candidates are ungraded.
No assertion of calibrated accuracy, model quality, complete coverage or witness truthfulness is made.

## One review flow after deployment

1. Save both transcripts and click Review documents (or Review again).
2. The single approval dialog displays the analysis estimate and an additional US$2 confidence
   allowance. It explains seven requests per eligible finding and potentially partial confidence coverage.
3. Approve once. Analysis runs unchanged; the existing borderline double-check stays unchanged.
4. Confidence runs automatically on the returned findings, sequentially, under the server-side
   shared allowance. Immutable allocation records reserve each full seven-call finding budget.
   No automatic retry or second approval occurs. Failed source validation spends nothing for that pair.
5. Each confidence checkpoint saves with the case. Cancellation or failure preserves analysis and
   completed votes. Remaining findings explicitly show stopped, incomplete or allowance-limited status.

The finding view shows a prominent AI agreement card, separate reviewer concerns and optional
explanation. Old numeric evidence displays and separate confidence-start controls are removed from
UI only; stored evidence fields and scoring code stay intact for compatibility and audit.
The finding list and ring show the combined experimental index for completed reviews; old agreement-only results remain distinguishable.
Existing saved findings stay readable and say Not checked until included in a newly approved review.
The approved allowance is tied to both source documents and expires after one hour; a changed source,
expired allowance or incomplete prior finding blocks new allocations without hidden paid retries.

Local checks use synthetic/mocked data only. No scripts in the test commands make model/network
calls or start persistent servers. They do not establish live provider access, Vercel behavior,
calibrated accuracy or hosted UI appearance.
