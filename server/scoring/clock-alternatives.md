# Event-clock alternatives — October 14, 2026

## Behavior

The `time` rule can now evaluate a simple event clock without choosing an unstated AM/PM. `parseClockAlternatives` returns AM and PM alternatives for supported single-clock phrases. The existing `parseTimeRange` still returns missing AM_PM to callers that have not opted into this comparison.

The rule compares every combination of both sides' alternatives using the existing range widening and midnight alignment. If all combinations conflict, it supports CONFLICT. If every combination overlaps, it supports COMPATIBLE. If relationships differ, it returns NOT_EVALUABLE with an explicit explanation. It does not use Claude's category or Chrono's inferred meridiem.

Evidence strength uses the smallest separation across all combinations, with the unchanged configured strength formula, tolerance and weights. The fired rule exposes `alternativeComparisons`, `minimumGapMinutes`, and a limitation explaining that the period was enumerated rather than guessed. It does not present one chosen alternative as the witness's actual time.

Existing person, event, activity, location, grounding and hypothetical guards remain. New alternatives support single clock phrases and supported approximation or trailing weekday context only. Compound ranges and temporal bounds remain unresolved. A cropped time from an unresolved source sentence containing a boundary is not converted into an event-time claim.

## Developer fixture expectations

| Pair | Intended result | Why |
| --- | --- | --- |
| 5:15 / 6:45, aligned event | CONFLICT | All four AM/PM combinations differ by at least 90 minutes |
| Around 6 / Around 10 at night | CONFLICT | Both 6 AM and 6 PM remain separated from the stated night time after widening |
| Around 8 / 8:30 | NOT_EVALUABLE | Same-period interpretations overlap; other interpretations do not |
| 5:15 / 5:15 | NOT_EVALUABLE | The unspecified periods can either agree or differ |
| Around 7 / 8 PM | CONFLICT, reduced evidence strength | Closest widened range is only 30 minutes away |
| Different or missing event anchor | NOT_EVALUABLE | Matching clocks alone cannot align events |
| Before 8 / 10 PM | NOT_EVALUABLE | Bound is not an event clock |
| Between 11 and midnight / 10 PM | NOT_EVALUABLE | Compound range semantics remain separate work |
| Unverified source | NOT_EVALUABLE/null | Parser cannot bypass literal witness grounding |

These are deterministic developer tests, not changes to approved gold labels or calibrated band judgments. The old unit expectation that every missing-period clock is unscorable was narrowed: the existing Around 7 / 8 PM fixture now establishes an invariant conflict. Unrelated-night regression examples compare against 8 PM, which genuinely produces mixed interpretations; they continue to guard against borrowing night context.

## Observed local replay

Source saved report: 2026-10-15T02:29:18.213Z, October 14 in Vancouver. All 62 returned candidates were replayed locally. Six changed:

- All three `exact-clockout-time` candidates: NOT_EVALUABLE/null → CONFLICT_SUPPORTED/90; smallest gap 90 minutes.
- All three `approx-clock-nonoverlap-restaurant` candidates: NOT_EVALUABLE/null → CONFLICT_SUPPORTED/90; smallest gap 180 minutes.
- The other 56 candidates kept their prior scores and statuses. Missing candidates were not manufactured.

This is a saved-evidence replay, not a new API run or a fresh general accuracy claim. It spent no Claude credits. No gold labels, production prompt, Chrono diagnostic policy or formula weights changed.

## Checks and remaining scope

```sh
node --test server/chronoTime.test.js server/scoring/*.test.js server/sourceEvidence.test.js server/comparisonRules.test.js
npm run tests:unit
```

Eight new alternative-comparison test groups cover positive, negative, grounding, event alignment, conservative gap strength and model-category independence. Midnight ranges, inequalities such as `didn't leave before midnight`, and ambiguous overlapping clocks still require further interpretation work. Do not force compatibility to satisfy a proposed label. Restart the backend before a future authorized single-attempt API subset; no full paid run without explicit approval.
