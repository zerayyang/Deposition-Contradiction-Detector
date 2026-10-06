# Deterministic evidence index

Claude finds and classifies candidates. This engine never uses its type, severity, reasoning, semantic opinions, or confidence to calculate a score, and never changes its classification.

Verified source quotes become literal facts. Registered rules compare supported facts and context. Conflict strength E comes from the strongest applicable conflict rule. Clause-scoped language produces commitment C for each claim; the pair uses the lower commitment. Default score: round(100 × E × (0.5 + 0.5 × C)). A derived conflict can be as strong as an explicit conflict. Approximate values widen their own ranges rather than also reducing commitment. Compatible comparisons receive a separate index capped at 15. Unsupported or ungrounded comparisons have no numeric score.

Source validation requires an exact quote inside a witness answer when Q/A markers are present. Examiner questions cannot ground a claim. The pipeline retains the surrounding source sentence so cropped excerpts cannot hide supported negation, conditions, or exceptions. Repeated answer occurrences without a unique source anchor are not scored. Home/departure comparisons require a shared source event/day anchor; plain witness text is still accepted but may lack that context. These checks cover supported patterns and abstain when they cannot establish a comparison.

All active weights, tolerances, caps and bands live in config.js. Values are provisional heuristics, not measured probabilities or likelihood of lying. The older comparisonRules.js exports remain for legacy regression checks; the active confidence pipeline uses this registry.

Run:

```sh
node server/sourceEvidence.test.js
node server/scoring/scoring.test.js
node server/comparisonRules.test.js
node server/scoring/calibrate.js
```

## Review labels

gold.json contains 22 draft pairs. expectedBand is reserved for owner-assigned labels and starts null. provisionalBand is a separate suggestion. All rows start debatable:true. Assign expectedBand and mark debatable:false only after reviewing the facts and context. Calibration reports unavailable accuracy until approved labels exist. It also reports band sensitivity for three weight mixes and 30/45/60-minute tolerances.

## Six sample comparisons

| Pair | Old index | New status / band | New index | Rule / explanation |
| --- | ---: | --- | ---: | --- |
| Home all evening vs leaving | 81 | CONFLICT_SUPPORTED / STRONG | 84 | location+activity: uninterrupted presence conflicts with departure; assertion hedge lowers commitment. |
| Approximate bedtime vs midnight | 48 | CONFLICT_SUPPORTED / MODERATE | 72 | time: independently widened ranges remain separated, with resolved evening context. |
| Pizza vs might have done both | 35 | NOT_EVALUABLE | — | UNSUPPORTED_PATTERN: no supported conflict; removed language-only fallback. |
| Alone vs neighbor waving | 43 | NOT_EVALUABLE | — | UNSUPPORTED_PATTERN: being alone and being seen are distinct concepts. |
| Warehouse vs broader area | 55 | NOT_EVALUABLE | — | UNSUPPORTED_PATTERN: current rules cannot establish a same-location conflict. |
| Prior awareness vs knew of him | 45 | NOT_EVALUABLE | — | MISSING_CONTEXT: the literal pair does not establish aligned awareness periods. |

These are deterministic fixture results, not a fresh Claude analysis. Null scores do not mean false positive and do not dismiss Claude's category. The four removed numeric scores were language-only estimates without a verified conflict. Review surprises: bedtime's provisional STRONG band is MODERATE; a memory-hedged departure remains STRONG at 79 rather than provisional MODERATE. Increasing time tolerance changes one fixture band; changing weight mix alone changes none in this small draft set. These are review signals, not grounds to tune until suggestions match.
