# Claude → validated phrases → Chrono

## Behavior

Claude still returns literal `claim1.timePhrase` and `claim2.timePhrase`. The extraction instructions now explicitly preserve contiguous range endpoints, attached dayparts and boundary/approximation wording. No parsed timestamps, scores, new model fields or rewritten evidence are requested.

`assessCandidate` validates each claim against the witness transcript, scores it with the existing deterministic engine, then creates `chronoTimeAnalysis.claim1` and `.claim2`. This additive response field is backend-generated; any model-supplied field with that name is overwritten. Chrono does not make a network call and is not a callable LLM tool in this design.

Each side reports:

- `status`: PARSED, PARTIAL_MATCH, NO_MATCH, MISSING_PHRASE, UNVERIFIED_SOURCE, AMBIGUOUS_SOURCE, INPUT_TOO_LONG or PARSER_ERROR.
- `phrase`, exact matched text/offsets, unmatched text, and start/end components.
- Per-component `value` and `knownByChrono`. Known means known to the parser, not independently verified source evidence or a calibrated confidence number.
- Fixed synthetic reference January 15, 2026 at noon UTC, explicitly labeled as synthetic. It is not a deposition date.
- `usedForScoring: false`. Dates and AM/PM inferred by Chrono never enter the score.

The backend emits `Chrono time interpretation` logs with request ID, finding index, side, parser status, match count and implied-meridiem count. It does not copy literal testimony into these new logs. Detailed matches are included in the existing analysis response, not persisted in a new database. There is no new UI panel.

Chrono is a runtime dependency because production code imports it. The server retains its existing one-request-to-Claude analysis flow. Classification, score formula, weights, gold labels, missing-candidate policy and the application's existing time comparison rules are unchanged.

## Fixture expectations (developer tests, not gold labels)

| Input | Expected diagnostic behavior |
| --- | --- |
| 11:00 p.m. | PARSED; hour 23; meridiem known by Chrono |
| 5:15 | Parsed clock, but meridiem/date marked implied |
| Around 10 at night | PARTIAL_MATCH because `Around` is outside the clock match |
| between 11 and midnight | PARTIAL_MATCH; only midnight recognized, no manufactured range |
| around 8 | NO_MATCH; no correction or hidden fallback |
| Missing/ungrounded phrase | Explicit missing/unverified status; do not parse it |
| Repeated quote without a source anchor | AMBIGUOUS_SOURCE |
| More than 2000 characters | INPUT_TOO_LONG, not silent omission |
| LLM injects chronoTimeAnalysis | Backend replaces it with its own diagnostic |

Compatibility and negative comparison expectations remain those of the existing deterministic rules. A Chrono match cannot turn NOT_EVALUABLE into CONFLICT or COMPATIBLE. This addition deliberately measures extraction behavior before it is trusted for evidence scoring.

## Test and inspect

```sh
node --test server/chronoTime.test.js server/scoring/*.test.js server/sourceEvidence.test.js server/comparisonRules.test.js
npm run tests:unit
node --test tests/time-parser/compare.test.mjs
```

Restart `node server/server.js` after saving. The next authorized analysis response will include `chronoTimeAnalysis`, visible in browser developer tools → Network → analyze → Response, and its summaries in the backend terminal. Do not run a full paid verification batch without explicit approval. Use saved evidence replay or local stubbed transport tests first.

## Observed validation

34 local scoring/grounding/comparison/Chrono test entries passed before integration, including explicit-versus-implied flags, safe refusal statuses, backend overriding injected metadata, privacy of new summary logs, and score independence. These tests use local data, not paid Claude calls. No new full-run accuracy improvement is claimed.

A final local replay of all 62 returned candidates in the saved report produced zero score/status differences and 63 claim-side Chrono matches (including partial matches). Missing candidates were not manufactured or dropped. This is replay, not a live model run.
