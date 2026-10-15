# Target-scoped verification

Approved cases may supply `target_claims: {claim1: "exact input 1 quote", claim2: "exact input 2 quote"}`. Each stored quote must be a nonempty contiguous substring of its testimony input. A detector finding matches only when its corresponding `claim1.original` and `claim2.original` each contain the entire exact target witness wording. A literal leading `A. ` or `A: ` answer marker is ignored on either side for comparison only; stored source quotes and audits are unchanged. Every other character, including case, whitespace and punctuation, must match. No fuzzy matching or selection by expected labels occurs.

Only matching candidates enter type/evidence/band checks and stability metrics. Findings outside the targets appear under **Extra findings — informational, not failures**, including their raw objects. A missing target finding fails as `NO_TARGET_PAIR_FAIL`; duplicate matching findings fail as `DUPLICATE_TARGET_PAIRS_FAIL`. Extras cannot rescue a missing target. Cases without targets retain the original one-pair contract.

`superseded_by`, `verification_policy.exclude: true`, or `review_status: "judge-disputed"` excludes a row from execution and pass/fail scoring even if its status is approved. Only approved, nonexcluded rows can be selected. Requests still contain only testimony inputs, never target claims, judicial metadata or private reference text.

`judicial_relation`, `conflict_basis`, `type_basis` and `judicial_expected_evidence` describe author-reviewed reference grounding. Detector agreement with `judicial_expected_evidence` is a separate informational line, never a replacement for project-rule type expectations or deterministic replay. Existing expected labels are unchanged. All score bands remain provisional and informational.

Run tooling checks with:

```sh
node --test tests/verifier/target-claims.test.mjs tests/verifier/verifier.test.mjs tests/verifier/level2-isolation.test.mjs
```

These use synthetic candidates and stubbed HTTP responses, not real case results or live detector requests. They cover ignored extras, exact matching, target omission/duplicates, excluded rows, unchanged legacy behavior, informational judicial disagreement, request isolation and report output. They provide no score calibration.
