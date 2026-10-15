# Explicit time notation — October 14, 2026

## Change

The parser now treats dotted/spaced meridiems (`p.m.`, `P.M.`, `p. m.`, `p m`, and corresponding AM forms) like `pm`/`am`. Normalization is internal: quotes and extracted evidence strings remain literal and unchanged.

A daypart immediately attached to a clock can resolve it: `10 at night`, `10 in the evening`, `10 in the morning`, `2 in the afternoon`. Night crosses midnight: `12:30 at night` is 00:30; ambiguous `2 at night` stays unresolved. No generic `late` -> PM shortcut remains. Conflicting morning/evening context stays unresolved unless the clock itself explicitly states a period.

Time scoring uses source-question context and an immediately attached daypart, rather than scanning the whole witness answer for any mention of night. `Around 8. It rained at night` cannot manufacture an 8 PM assertion. An attached daypart can be recovered when Claude's literal time extraction stops just before it.

Formula weights, thresholds, production prompt, API and approved gold labels were not changed. This is a parsing fix; it does not implement ambiguous-clock alternatives, midnight inequality reasoning, holiday anchors or the other missing fact rules.

## Regression expectations (developer fixtures, separate from approved gold)

| Fixture | Expected result |
| --- | --- |
| 11:00 p.m. / 11:00 pm | Identical exact clock, 23:00 |
| 12:00 a.m. / 12:00 p.m. | 00:00 / 12:00, kept distinct |
| between 7 and 9 p.m. | Same interval as between 7 and 9 pm |
| from 11 p.m. to 1 a.m. | Overnight interval 23:00–25:00 |
| Around 10 at night | 22:00 widened by existing tolerance |
| Other sentence or activity mentions night | Must not supply an earlier clock's AM/PM |
| Morning or evening question | Ambiguous without an explicit period |
| Bare 5:15, around 6, between 11 and midnight | Still unresolved; no guessed period |
| Date, duration or 13 p.m. | Not a supported clock value |

Run `node --test server/scoring/*.test.js server/sourceEvidence.test.js server/comparisonRules.test.js` and `npm run tests:unit`.

## Observed validation

All eight new time-notation regression groups and existing local scoring/location/action/grounding/comparison suites passed (30 Node test entries, some with multiple assertions).

A local replay of the previous verifier report's stored candidates changed only `unrelated-hedge-shift`: all three saved attempts changed from NOT_EVALUABLE/null to CONFLICT_SUPPORTED/90. The claim's 11:00 p.m. versus 7:00 p.m. clocks are now comparable. Other recorded statuses and scores were unchanged in this replay.

This is deterministic replay, not a new model run or a new accuracy measurement. The restaurant case still has an ambiguous first time (`Around 6`) even after recognizing the second clock's night wording. Existing reports remain historical; restart the backend and run fresh verification before claiming live improvements.
