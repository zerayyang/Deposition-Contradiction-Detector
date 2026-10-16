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


## Part 2 synthetic source checks (`source.test.mjs`)

All names and source snippets in this file are invented implementation fixtures;
none are author gold, verifier results or private testimony. No new categorization
labels or numeric targets are approved here.

| Situation | Intended local outcome |
| --- | --- |
| Named witness plus named questioner | Unmapped witness rejected; exact trusted role mapping enables literal answer and question links. |
| Court/counsel/unknown turn after A | Turn excluded from witness evidence; preceding answer ends at its boundary. |
| Unicode, CRLF, numbered turns, preamble | Ordered source ranges reproduce every original character and exact quote offsets. |
| Case/whitespace variants, surname-only alias | Exact normalized full label works; missing alias is not guessed. |
| Plain prose, time, URL | Existing plain-text input behavior retained; no person identity claimed. |
| Speaker-like heading | Conservative unknown-speaker warning; header content is not witness evidence. |
| Interruption before answer | Literal answer retained; prior question unavailable; fabricated resumed anchor rejected. |
| Fresh question after interruption | New governing link restored; old frame not inherited. |
| Multiple witnesses | Second witness does not inherit first witness question; fresh question retained. |
| Repeated Yes answers | Ambiguous without a unique literal anchor; correct question selects the exact occurrence. |
| Initial-plus-name labels (A. Reed) | Not mistaken for Q/A labels; declared roles required for witness speech. |
| Model supplies speaker role / invented anchor | Model role ignored; invented source anchor rejected. |
| Invalid caller mappings | Explicit TypeError, or SOURCE_OPTIONS from event validator; no auto-correction. |
| Unanswered dated question before another question | Date excluded from answered-question history. |
| Named event record and wrong question | Source validation succeeds only with trusted mapping and correct governing question. |
| Same literal evidence in named vs Q/A format | Existing deterministic status/score agree; changing model type/severity/reasoning alone does not change score. |
| All validations | Text, mappings and proposed event records remain unchanged. |

Run `npm run tests:events`. These are deterministic source-binding assertions,
not an evaluation of AI-generated cases or legal classification accuracy. No paid
calls are required. Numeric scoring correctness/calibration is outside Part 2.
