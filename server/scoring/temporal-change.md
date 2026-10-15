# Date/time normalization change — October 14, 2026

- Added structured literal date/time components and the requested `YYYY/MM/DD HH/mm` display to each scored API candidate (`temporal.claim1` and `temporal.claim2`). Unknown components remain empty; original wording and provenance remain visible.
- Shared canonical date keys between context and point-location comparisons; supports full English month/day spellings, year-first numeric dates, and fixed New Year's Eve/Day dates. No current-year or synthetic Chrono defaults are used. Different or missing years are not treated as equal.
- Removed supported date tokens before clock parsing to prevent date numbers from becoming event times. Bounds/ranges retain tokens but do not collapse into a point timestamp in the normalized display.
- No dependencies, frontend changes, classification prompt changes, formula changes or approved-label edits.
- Local checks: 48 Node test entries passed (including existing script-based scoring/source suites). Covers date equivalence, missing fields, invalid dates, range guards, source grounding, metadata independence and location comparison.
- Replayed the five saved API responses locally without calling Claude. The two formerly supported conflicts remain supported at 90. The two overlap cases and midnight-negation case remain NOT_EVALUABLE. Date normalization alone does not implement their missing semantics. This is a replay, not a new live verification or stability measurement.
- Next: diagnose/support compound estimates, continuous ranges and midnight bounds independently. Rerun only targeted cases after local checks; no full paid run without explicit approval.
