# Canadian holiday dataset experiment

This local diagnostic uses date-holidays 3.37.0 with country `CA`, province `BC` and English names. It does not call Claude, change the prompt or production scoring, or edit gold labels.

Run from the project folder:

```sh
node tests/holiday-parser/lookup.mjs
node --test tests/holiday-parser/lookup.test.mjs
node tests/holiday-parser/lookup.mjs 2026 "Thanksgiving" "New Year's Eve"
```

The CLI's no-argument example uses 2026 solely as a labeled demonstration year. The exported lookup helper requires an explicit year and returns YEAR_REQUIRED otherwise. It does not assume today's year for testimony. Returned calendar labels are taken from this package, not independently established legal classifications.

## Expected fixtures

| Input | Expected observation |
| --- | --- |
| Canada Day, 2026 | July 1, 2026 |
| British Columbia Day, 2026 | August 3, 2026 |
| Thanksgiving, 2026 | October 12, 2026, from CA/BC data |
| Thanksgiving, 2025 | October 13, 2025; year affects moving holidays |
| New Year's Eve, 2026 | December 31, 2026, from application Canadian additions |
| Missing year | YEAR_REQUIRED, no default current-year lookup |
| Unknown occasion | NOT_IN_DATASET, no guessed date |

These are deterministic lookup tests, not contradiction gold cases. They assign no DIRECT/INFERENTIAL/FALSE_POSITIVE labels, evidence verdicts, score bands or probabilities. No lookup creates a conflict score or proves that two testimony references describe the same event. Negative and ambiguous inputs remain explicit.

## Application additions

`canadian-additions.json` supplies New Year's Eve as December 31 when the upstream CA/BC dataset lacks that name. Results identify this source explicitly. It is an occasion, not a claim of statutory-holiday status. An explicit year is still required. The `00:00:00` suffix is a calendar marker, never evidence of an event's time. Missing testimony components must remain blank when normalized for comparison.

Expected results: all six demonstration names resolve; New Year's Eve uses the application source, and the other five use date-holidays CA/BC. The test covers December 31 across 2025–2027 and rejects a missing year. This lookup remains separate from production scoring; midnight bounds and negation remain separate work.

Names are matched case-insensitively with normalized apostrophes/whitespace. There is no fuzzy matching, automatic US fallback, transcript scanning or province inference. A name can produce multiple calendar entries; the helper returns all exact-name matches instead of choosing one. Before scoring, original versus observed dates, region, reference year and event identity need explicit handling.

Upstream source: https://github.com/commenthol/date-holidays. Retain the installed package's license and data attribution notices when distributing it.
