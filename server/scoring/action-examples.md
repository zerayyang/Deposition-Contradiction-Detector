# Movement action matching — 2026-10-14

## Change for the demonstration

Previously the activity rule compared normalized action strings literally. `didn't go inside` conflicted with `went inside`, but not with `went inside to buy cigarettes`. Different extraction lengths could therefore produce different evidence statuses for the same testimony.

The narrow new rule checks the original witness sentence: an affirmative movement inside/outside for a stated purpose implies that movement happened. A blanket denial of the same movement in an aligned source event conflicts with it. The source must explicitly refer to the witness (`I`); no subject or event is invented. This is deterministic code, not another AI judgment. The source sentence is also used for commitment so cropping `I think` cannot inflate the score.

The rule does not strip arbitrary extra words from every action. Ownership, vehicle identity, time parsing, missing findings and other unsupported patterns are separate work. Formula weights, thresholds, Claude instructions, API shape and approved gold labels were not changed.

## Proposed fixture expectations

These are focused developer regression tests, separate from the approved HTTP gold set and from calibrated accuracy.

| Pair | Expected activity-rule result | Reason |
| --- | --- | --- |
| I didn't go inside / I went inside to buy cigarettes | CONFLICT | Blanket movement denial versus actual movement |
| I didn't go outside / I went outside to get help | CONFLICT | Same implication, without relying on particular purchases |
| I didn't go inside to buy cigarettes / I went inside to get help | Unresolved | Denial may concern purpose only |
| I went inside to buy cigarettes / I went inside to get help | Unresolved | Differing purposes alone prove neither contradiction nor full agreement |
| I didn't go outside / I went inside to get help | Unresolved | Different directions |
| Inside store / inside office | Unresolved | Different destinations cannot be discarded |
| Different dates or no shared event anchor | Unresolved | The new implication requires aligned source context |
| Hypothetical, exception, reported speech, or different person | Unresolved | Source does not support the required actual witness assertion |
| Full versus cropped `I think I went inside to get help` | Same score, below unhedged | Commitment follows the source assertion |

Unresolved means this activity rule does not fire; another independently supported rule could still apply in a broader transcript.

## Observed validation

Before implementing the fix, two of the six initial regression groups failed. After implementation, all nine action test groups passed, along with existing scoring, location, source-grounding and comparison suites (22 Node test entries altogether; some entries execute multiple assertions).

Replaying the three saved candidates for `negation-direct-store` through the updated deterministic pipeline produced:

| Saved attempt | Previous status | Replayed status | Replayed score |
| --- | --- | --- | --- |
| 1 | NOT_EVALUABLE | CONFLICT_SUPPORTED | 90 |
| 2 | CONFLICT_SUPPORTED | CONFLICT_SUPPORTED | 90 |
| 3 | NOT_EVALUABLE | CONFLICT_SUPPORTED | 90 |

This replay reused the recorded extracted phrases; it made no new model requests. It does not establish a new 23-case accuracy figure. The original reports remain observations of the earlier code.

Run local regressions:

```sh
node --test server/scoring/*.test.js server/sourceEvidence.test.js server/comparisonRules.test.js
npm run tests:unit
```

For a new live report, restart the backend so it loads the updated modules, then run `npm run tests:all -- --pdf`. Keep all failures and do not relabel approved cases to match output.
