# Chrono local experiment

This is a separate diagnostic, not part of the server or confidence formula. It uses the installed development dependency chrono-node 2.10.3. No Claude, database or network calls occur.

## Follow the code

Open `tests/time-parser/compare.mjs`.

1. Import Chrono and the current deterministic parser.
2. Set a fixed synthetic date and UTC timezone. This makes reference-dependent results reproducible; the date is not testimony or an inferred deposition date.
3. Pass each original string unchanged to `chrono.parse()` and the existing parser.
4. For every result, copy its exact matched text, character offset, start and optional end components.
5. For each component, record `get(field)` and `isCertain(field)`. `knownByChrono: false` means it was inferred or absent; true means Chrono considers it known, not that the transcript has been independently verified. This flag is not a confidence percentage.
6. Print a table and save all details in `tests/report/chrono-comparison.json`. Separate this diagnostic from the verifier's report.html/results.json.

Run from the project folder:

```sh
node tests/time-parser/compare.mjs
node --test tests/time-parser/compare.test.mjs
```

For your own strings, quote each as a separate argument:

```sh
node tests/time-parser/compare.mjs 'I left at 11:00 p.m.' 'I left around 8.'
```

Each run overwrites only chrono-comparison.json, the diagnostic's latest local output. Do not use private deposition inputs for output you intend to share. The script prints the output path.

## Intended checks and limits

This is an interpretation experiment, not classification gold. It assigns no DIRECT/INFERENTIAL/FALSE_POSITIVE labels or confidence bands. The main question is whether a parser exposes explicit versus implied information and whether it matched the whole relevant time expression.

- Explicit `11:00 p.m.` should identify 23:00 with a known meridiem.
- Bare `5:15` must expose an implied AM/PM, never silently treat it as testimony.
- A partial match for `between 11 and midnight` must not be represented as a complete interval.
- Unparsed input must remain visible as NO MATCH.
- A recognized `midnight` token does not verify the meaning of `didn't leave before midnight`.
- Approximation and assertion qualifiers must remain the responsibility of independently validated scoring rules; a clock timestamp does not measure uncertainty.

## Observed results (local, October 14, 2026)

The script was executed against all 14 example strings. All four diagnostic regression tests passed.

| Input | Observed Chrono 2.10.3 result |
| --- | --- |
| 11:00 p.m. | 23:00; meridiem known by parser |
| Around 10 at night | Matches `10 at night`, 22:00; approximation is outside the match |
| 5:15 | 05:15 with implied AM/PM |
| around 8 | No match |
| Around 8, maybe 8:30. | Only `8:30` matched, with implied AM/PM |
| between 11 and midnight | Only `midnight` matched; no range endpoint |
| I didn't leave before midnight. | Only `midnight` matched; negation and inequality not interpreted |
| I left around 12:30. | 12:30 with implied PM |
| from 11 p.m. to 1 a.m. | Start 23:00 / end 01:00, range recognized |
| around 8. It rained at night. | Only `night` matched, interpreted as 20:00 with implied meridiem |

These results support testing Chrono as a candidate extractor, not replacing the evidence engine with its dates. No improvement to app accuracy or score availability is claimed. A future adapter would need to preserve matched spans, uncertainty, scope, reference assumptions, boundaries and negation before any output influences scoring.
