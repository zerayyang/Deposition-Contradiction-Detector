# Fictional functionality smoke — implementation input, not approved gold

The two source strings in functional-smoke.json describe three topics in different
orders. Send only those source strings and their workflow metadata to the detector.
Keep this guide out of model instructions.

Proposed checks (not observed results):
- First-form signing: DIRECT opposition on the same named meeting/day; literal quotes
  from the two witnesses. Existing activity-polarity rules should support conflict.
- Second-form signing: FALSE_POSITIVE/compatible agreement on the same meeting/day.
  A standalone card may be suppressed but its assessed comparison must remain in the audit.
- Shift end: FALSE_POSITIVE/compatible overlapping approximate clocks on the same date
  and event. Do not invent an exact 8 pm value or force a conflict from a ten-minute gap.
- All three questions/answers must be accounted for in extraction; order must not determine
  matching. Cross-topic pairs may be explicitly unrelated, with reasons and complete coverage.
- Exact source quotations/offsets must validate. Scores come exclusively from code; no
  numeric score target is an approved calibration label.

Use offline transport fixtures first. Paid execution requires an explicit request/cost
cap, no automatic retries, and records raw outputs/failures; incomplete extraction must
block comparison. Do not promote these expectations into gold or production lessons.

## Approximate separation companion

`approximate-separation.json` is another fictional implementation smoke. Proposed
expectation: same explicitly dated restaurant arrival, INFERENTIAL because incompatibility
requires comparing approximate clock ranges; existing widened-time rules should support
conflict. Quotations and all units must validate; numeric correctness and stability are
not calibrated by this one attempt. No exact-value DIRECT label should be forced onto
the two approximate clock assertions. Same spending/no-retry rules apply.
