# Fictional Part 1 fixtures and expected outcomes

Run `npm run tests:events` from the repository root. All data in `fixtures.json` is
fictional, manually constructed schema input. Nothing here is approved gold, a live
model output, a numeric calibration target or a production extraction rule. Existing
author/verifier files are not read. No model calls, server listeners or SQL migrations.

| Fixture | Expected record behaviour |
|---|---|
| presence-denial | Denial with place/occasion sourced from its actual question; unknown companions. |
| presence-affirmation | Affirmed presence with literal place/occasion; no invented year or companions. |
| signing-uncertain | Uncertain assertion, literal hedge, missing time, visible review reason. |
| signing-denial | Explicit action denial; no invented date or different lease. |
| approximate-time | Preserve approximation on the time value; no invented precise interval. |
| approximate-quantity | Literal approximate words and units; no automatic exact number. |
| explicit-correction | Keep both assertions and their correction link; overwrite neither. |
| ambiguous-person | Unknown identity despite a name in the question; visible review. |
| unfamiliar-event-kind | New kind and recipient attribute accepted without a new event-specific parser. |
| repeated-answer | Exact offsets and governing question bind the second occurrence correctly. |

For later comparison only: the presence affirmation/denial and signing affirmation/
denial illustrate possible DIRECT comparisons if subject/object/occasion identity is
established. The assertion hedge does not by itself require INFERENTIAL. Different
occasions or unresolved people must not be forced into conflicts. Approximate values
alone are not contradictions, and explicit correction needs contextual review.
None of these proposed comparisons is evaluated or promoted to gold in Part 1.

Negative checks must reject invented quotations/fields/pages, changed documents,
wrong offsets or governing questions, counsel/court words used as witness evidence,
unknown or duplicated IDs, unsupported extra fields/numeric confidence, numeric
coercion, false values for unknowns, hidden uncertainty, invalid correction links,
and gaps/overlaps/unaccounted source ranges. No proposal is silently fixed or removed.
Page checks use a supplied map; plain text invents no PDF labels.

Passing proves shape, source-location and accounting mechanics only. The semantic
limitation check deliberately demonstrates that a well-formed wrong polarity can
pass literal validation: later semantic review is required. COMPLETE coverage does
not prove exhaustive event recall. No detector accuracy improvement is claimed.
