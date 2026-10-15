# Target-scoped verification

Approved cases may supply `target_claims: {claim1: "exact input 1 quote", claim2: "exact input 2 quote"}`. Each stored quote must be a nonempty contiguous substring of its testimony input. A detector finding matches only when its corresponding `claim1.original` and `claim2.original` each contain the entire exact target witness wording. A literal leading `A. ` or `A: ` answer marker is ignored on either side for comparison only; stored source quotes and audits are unchanged. Every other character, including case, whitespace and punctuation, must match. No fuzzy matching or selection by expected labels occurs.

Only matching candidates enter type/evidence/band classification checks. Findings outside the targets appear under **Extra findings — informational, not failures**, including their raw objects.

For a target-scoped case with expected type FALSE_POSITIVE **or** expected evidence NOT_EVALUABLE, no matching target is **PASS — not flagged**. Repeated omissions are stable negative outcomes, not measured classifications or bands. A matching finding labeled DIRECT or INFERENTIAL fails under the negative-target policy even if the stored expected type is DIRECT/INFERENTIAL and evidence is NOT_EVALUABLE. A returned FALSE_POSITIVE still undergoes grounding, deterministic provenance and required evidence checks. Stored labels never change.

For a positive target, no exact match is `TARGET_NOT_MATCHED`, a **match issue**, not a classification failure. The check remains unresolved and does not pass, but it is excluded from classification-accuracy denominators and label-recheck triggers. Terminal/HTML/JSON reports list up to three nearest extra findings beside the exact targets, ranked by mean per-side token Jaccard similarity (case-insensitive diagnostic ranking only). Similarity never makes a finding match and does not establish whether the target was truly missed. All extras remain informational.

Duplicate matching findings fail as `DUPLICATE_TARGET_PAIRS_FAIL`. Cases without targets retain the original one-pair contract. Reports separately count not-flagged passes, unmatched-target issues, and classification failures; absence outcomes never earn type/evidence/band correctness credit.

`superseded_by`, `verification_policy.exclude: true`, or `review_status: "judge-disputed"` excludes a row from execution and pass/fail scoring even if its status is approved. Only approved, nonexcluded rows can be selected. Requests still contain only testimony inputs, never target claims, judicial metadata or private reference text.

`judicial_relation`, `conflict_basis`, `type_basis` and `judicial_expected_evidence` describe author-reviewed reference grounding. Detector agreement with `judicial_expected_evidence` is a separate informational line, never a replacement for project-rule type expectations or deterministic replay. Existing expected labels are unchanged. All score bands remain provisional and informational.

Run tooling checks with:

```sh
node --test tests/verifier/target-claims.test.mjs tests/verifier/verifier.test.mjs tests/verifier/level2-isolation.test.mjs
```

These use synthetic candidates and stubbed HTTP responses, not real case results or live detector requests. They cover ignored extras, exact matching, target omission/duplicates, excluded rows, unchanged legacy behavior, informational judicial disagreement, request isolation and report output. They provide no score calibration.

## Shortened exact passages

If both returned witness quotes and approved targets contain one another literally on their corresponding sides, but a returned quote omits part of a target, the verifier records `partialTargetFindings`. These include omitted prefixes/suffixes, source ambiguity, independent candidate checks and score breakdowns. Both sides must be grounded in witness text; word similarity alone cannot qualify. Repeated passages are marked ambiguous, never resolved by guessing.

Without a full target match, these findings produce **PARTIAL_TARGET_REVIEW**, a match issue requiring human review. They cannot pass a positive case, earn accuracy credit, trigger label-recheck suggestions, or pass a negative case as “not flagged.” A fragment could omit a denial, hedge or exception. The approved target, app output and labels remain unchanged. When a full target also exists, it is graded normally; partial extras remain informational. Multiple partials are all shown, never silently selected by type or score.

### Regression expectations and local checks

`partial-targets.test.mjs` uses synthetic inputs only. Expected: shortened witness passages receive REVIEW, even if their apparent type matches; omitted negations/qualifiers remain visible; repeated text is ambiguous; question text, rewritten phrases, reversed sides and missing quotes do not become partial matches. Exact full targets and legacy behavior remain unchanged. Reports highlight source fragments and show diagnostic-only score checks without counting them in target accuracy. A generic relationship-label denial versus a vague admission remains NOT_EVALUABLE with null score regardless of model category/reasoning: there is no deterministic rule establishing that those different terms mean the same thing.

Run `node --test tests/verifier/*.test.mjs` locally. No live API calls are needed for these stubbed tests. An offline success is not evidence of live AI accuracy or score calibration.
