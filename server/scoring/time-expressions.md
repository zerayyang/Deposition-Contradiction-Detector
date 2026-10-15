# Time expressions: saved-response regression fix

## Plain-language changes

- Treat a negated BEFORE statement as a lower limit on an event's time, rather than a denial that the event happened. A supported departure after that limit can be compatible. Unsupported bounds still receive no score.
- Read compound clock estimates and the suffix “or so.” Approximate values use the existing 30-minute tolerance once; compound estimates preserve the envelope of the stated values.
- Compare arrival/event windows with points. A nonempty intersection can support **possible consistency** under an explicitly retained AM/PM interpretation. It does not establish the actual period or a unique date. Existing single-point ambiguous-clock behavior remains conservative. This rule does not turn continuous sleep/presence into a point event or assign new conflict strength to unsupported ranges.
- Keep independent comparisons of materially different bounds/precision in the AI response even when compatible. The prompt still omits wording-only repetitions and consolidates supporting details. It contains no fixture-specific expected answers.
- Show unsupported-pattern explanations when no rule can evaluate a candidate. Previously those reasons disappeared from rulesLimiting.

The deterministic scoring formula, weights and provisional band thresholds are unchanged. Configuration version is `evidence-index-v3-time-expressions`. No Claude classification, reasoning, semanticAssist or LLM confidence field decides a rule verdict or numeric score. Source grounding/person/event guards remain in place. Date/time collection never fills in unknown AM/PM/year values.

## Fixtures and expected outcomes

`fixtures/time-response-regressions.json` preserves requests and model fields for the four actually returned candidates from the saved `live-five-single-20261015T010500Z` report. The game entry is explicitly marked **local hypothetical candidate**: its live response was empty, so its fields cannot be recovered from that response. It exercises downstream scoring only and is not evidence that the AI omission is fixed. These fixtures are regression inputs, not approved gold or training data.

| Issue | Expected local outcome |
| --- | --- |
| Exact clock-out values | Conflict supported, original score 90 retained |
| Compound bar estimates | Compatible supported, small compatibility index, unresolved periods disclosed |
| Approximate restaurant separation | Conflict supported, original score 90 retained |
| Negated-before-midnight departure | Compatible supported as a possible reading, never a blanket departure conflict |
| Hypothetical game candidate | Compatible supported if this source-grounded candidate is returned |
| Different events, invented quotes, negated occurrence, unsupported bounds | No newly supported compatibility |
| Nonoverlapping explicit windows | This new consistency rule must not claim compatibility |
| Continuous sleep/presence | No inference that a continuous interval is merely an uncertain arrival time |

The fixture IDs, quoted clock values and expected numeric values above are confined to test/documentation files. Model-opinion changes must leave scores identical. Tests preserve multiple period alternatives and disclose the existential compatibility policy; the result is not a probability that testimony is true.

## Run and observations

```sh
node --test server/scoring/*.test.js server/chronoTime.test.js server/sourceEvidence.test.js
npm run tests:unit
```

Run locally before any paid API analysis. Scoring/source/Chrono regressions and the harness are checked separately: 56 scoring/source/Chrono test entries and 53 harness tests passed in local checks. The four returned saved candidates replay with the expected evidence status; clock-out/restaurant retain 90. The manually constructed game candidate tests only rule support. Unit tests include changed metadata, invalid grounding, reversed claim order and scope/counterexample guards. No approved labels were edited, and no paid call occurred during implementation. A live generation check of the revised reporting instruction is still required; a stub cannot prove model compliance or stability.

Restart the existing backend after updating it. Future live checks should be an explicitly authorized five-case, one-attempt subset without retries; keep raw results and distinguish returned-type errors, missing output and evidence failures. No full corpus run is justified by local test success alone.
