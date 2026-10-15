# Deterministic evidence index

Claude finds and classifies candidates. This engine never uses its type, severity, reasoning, semantic opinions, or confidence to calculate a score, and never changes its classification.

Verified source quotes become literal facts. Registered rules compare supported facts and context. Conflict strength E comes from the strongest applicable conflict rule. Clause-scoped language produces commitment C for each claim; the pair uses the lower commitment. Default score: round(100 × E × (0.5 + 0.5 × C)). A derived conflict can be as strong as an explicit conflict. Approximate values widen their own ranges rather than also reducing commitment. Compatible comparisons receive a separate index capped at 15. Unsupported or ungrounded comparisons have no numeric score.

Source validation requires an exact quote inside a witness answer when Q/A markers are present. Examiner questions cannot ground a claim. The pipeline retains the surrounding source sentence so cropped excerpts cannot hide supported negation, conditions, or exceptions. Repeated answer occurrences without a unique source anchor are not scored. Home/departure comparisons require a shared source event/day anchor; plain witness text is still accepted but may lack that context. These checks cover supported patterns and abstain when they cannot establish a comparison.

All active weights, tolerances, caps and bands live in config.js. Values are provisional heuristics, not measured probabilities or likelihood of lying. The older comparisonRules.js exports remain for legacy regression checks; the active confidence pipeline uses this registry.

Run:

```sh
node server/sourceEvidence.test.js
node server/scoring/scoring.test.js
node --test server/scoring/locations.test.js
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

## Same-time locations

The `point-location` rule independently parses affirmative sighting/presence assertions from verified source sentences. Matching subject, date and exact time plus different supported venue families can support a location conflict; ambiguous aliases, containment, approximate clocks and different visits do not. See [examples, expected results and limits](location-examples.md). The provisional `locationConflictStrength` is separate from the unchanged formula weights; location co-location is not independently verified. Matching clocks alone no longer assert compatibility for different extracted locations. Existing saved findings need a new analysis to receive the updated result.

## Movement purpose clauses

The activity rule now handles a blanket denial of entering/exiting versus affirmative movement for a stated purpose, using the source sentence and shared event context. Purpose-limited denials remain unresolved. See [examples, observed replay and limitations](action-examples.md) and run `node --test server/scoring/actions.test.js`.

## Explicit time notation

The clock parser accepts dotted/spaced AM/PM and immediately attached dayparts. Unrelated answer wording cannot resolve a missing period; ambiguous clocks remain unresolved. See [time examples, expectations and observed replay](time-examples.md). Run `node --test server/scoring/timeNotation.test.js`.

## Event-clock alternatives

The event-time rule enumerates supported missing-AM/PM alternatives and scores only invariant relationships, using the smallest possible gap. Mixed interpretations remain unresolved. See [clock alternatives, expectations and saved replay](clock-alternatives.md). The ordinary parser and Chrono diagnostics retain their existing contracts.

## Normalized calendar and clock components

The API's additive `temporal.claim1` / `temporal.claim2` contain `fields` (year, month, day, hour, minute), a `YYYY/MM/DD HH/mm` display, and separate literal date/clock records with provenance. Unstated values are empty strings. No current date or Chrono synthetic defaults enter these fields. These are calendar scope plus clock components, not an absolute timestamp: midnight may belong to an overnight boundary and is not silently assigned to the following day.

Calendar keys are now shared by event context and point-location comparisons. Supported inputs: year-first numeric dates with slashes/hyphens, full English month names with optional ordinal day/year, and explicit New Year's Eve/Day references. The fixed named occasions resolve to December 31/January 1, with no guessed year. Other holidays still need separate integration; the Canadian diagnostic dataset is not automatically consulted. A known year does not match an unstated year. Invalid/multiple dates do not establish a shared calendar day. Matching dates alone do not prove the same occurrence; other existing person/activity/source guards still apply. Supported dates are removed before clock parsing so their numbers cannot become hours. Ambiguous day-first/month-first numeric dates are unsupported.

Run `node --test server/scoring/temporal.test.js`. Proposed fixture expectations:

| Literal inputs | Expected result |
| --- | --- |
| December 31, 2026 at 11:45 pm | `2026/12/31 23/45` |
| December 31 at 11 pm | `/12/31 23/` (no invented year/minute) |
| 5:15 | Hour blank, minute 15; literal 12-hour value retained separately |
| Tomorrow at 23:15 | Calendar blank; explicit clock 23/15 |
| New Year's Eve | Month/day 12/31; year and event time blank |
| between 11 and midnight / before midnight | Tokens retained; no collapsed point time |
| Same arrival, 2026/12/31 vs December 31, 2026, 11 pm vs 7 pm | Existing time rule supports conflict |
| Different years, invalid dates, or multiple dates | No shared-day inference |

Original quotes remain unchanged and undergo existing grounding. Formula, weights, bands and Claude classification prompt are unchanged. Range overlap and boundary/negation interpretation remain separate work. Observed local regression/replay results are documented in `temporal-change.md`; fixture expectations are not calibrated score labels.

## Compound times, event windows and departure bounds

The time rule supports possible consistency for compound estimates/window-versus-point comparisons and a source-grounded negated-before departure restriction. Unknown periods remain enumerated, not asserted as known. Unsupported rule reasons are visible when scoring is unavailable. See [implementation notes, fixture expectations and limits](time-expressions.md). Compatible means the accounts can coexist under a supported interpretation, not that the actual clock or overnight date is proven. Ordinary single-point ambiguity and unrelated event/source guards are retained. The AI reporting instructions now retain independent comparisons of different bounds/precision even when compatible; live compliance has not been measured by local scoring tests.
