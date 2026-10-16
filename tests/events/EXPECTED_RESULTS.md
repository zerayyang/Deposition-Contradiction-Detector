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


## Part 3 mocked extraction checks (`extract.test.mjs`)

All snippets and PDF page manifests in these tests are synthetic. Mock event
interpretations are scripted implementation inputs, not approved author gold or
observed model accuracy. Classification types/numeric calibration are not tested
by this extraction stage. No author or verifier artifacts are read.

| Scenario | Intended behavior |
| --- | --- |
| One short / two complete inputs | Inert preview; independent extraction requests, stable immutable plan IDs. |
| New event kind / uncertain assertion / unknown companions | Generic record shape accepted; uncertainty and nulls preserved. |
| Missing, duplicate, extra, unsupported or unresolved answer disposition | Partial result with explicit issues; never claim complete processing. |
| NO_EVENT with reason | Auditable model judgment accepted; not proof of recall. |
| Invalid quote or invented punctuation | Quarantine original proposal; retain valid siblings and raw response. |
| Model roles, offsets, pages, numeric confidence or scoring attributes | Strict rejection; code supplies source metadata, model supplies no score. |
| Wrong question / nonliteral fields / question-only assertion | Existing deterministic source checks reject it. |
| Repeated/overlapping quotes | Explicit occurrence required when ambiguous; exact selected offsets stay verifiable. |
| Duplicate event IDs / invalid correction target | No overwrite or link repair; reject all duplicates/dependents visibly. |
| Invalid JSON, fences, output truncation or malformed envelope | Failed task, original text and returned usage retained; no retries. |
| Wrong approval, changed plan, request cap or invalid source | No model invocation. |
| Named speech | Reviewed caller metadata required; no model-assigned witness role. |
| Long continued answer | Full governing question retained; every core character accounted for. |
| 3,000 Q/A pairs | Every source turn retained; copied working histories bounded to the existing four-question context window. |
| 225 synthetic pages | Every page represented in source refs, exact offsets and complete core coverage. |
| Failure/cancellation/timeout/checkpoint error | Retain completed records; expose failed/unprocessed ranges; stop on cancellation/checkpoint errors. |
| Missing usage / unpriced cache | Cost unknown, never silently zero; recorded tokens remain distinct from Codex credits. |
| Input and response objects | No mutation, coercion, auto-repair or caller-manifest freezing. |

Run `npm run tests:events`. No paid API calls, server startup, credentials or private
source files are needed. Read EXTRACTION.md before wiring this to a live transport.


## Part 4 mocked matching/comparison (`compare.test.mjs`)

Inputs are fictional testimony and manually constructed source-valid event records;
mock model replies are scripted transport assertions. This does NOT measure live
classification accuracy or create author gold. For the signing/denial mock, DIRECT
is the scripted type under an assumed shared fact/occasion, not an approved finding.
The tests also inject INFERENTIAL and FALSE_POSITIVE to check preservation of each
category and prohibition of model confidence. Scope and semantic correctness still
require human-reviewed evaluation of live outputs, not transport pass counts.

| Scenario | Intended local behavior |
| --- | --- |
| Reordered / differently named / disputed-attribute records | Every block crosses the other document; no lexical or event-kind exclusion. |
| Unrelated pairs | Explicit ranged dispositions with reasons and actual IDs; no invented type/score. |
| Compatible/identical assessment | FALSE_POSITIVE audit retained even with report:false. |
| Multiple issues in one pair | Every independent scripted issue retained. |
| Unknown witness identity, event ambiguity, missing scope | Explicit review flags/reasons; no inferred shared person or occasion. |
| Missing rows/cells, duplicates, overlap, invalid ranges | Visible issues; cannot count as a complete comparison. |
| Bad citation or malformed issue | Rejected proposal/raw response retained; valid independent siblings survive. |
| Question-only or opposite-document support | Rejected, never treated as a witness source. |
| Model scores/evidence status/new label/rewritten quote | Strict validation rejects; no numerical confidence produced. |
| Fully equivalent records | Conservative grouping, every original member preserved. |
| Same quote/different interpretation or occasion | Separate records and findings; original question contexts retained. |
| Distant corrections | Both-direction context includes old/new linked assertions; neither is deleted. |
| Short excerpt hides qualifier | Full original witness answer and governing question supplied. |
| Invalid source/hash/coverage, stale approval, cap/context excess | Stop before model invocation; no text or events silently omitted. |
| Partial upstream extraction | Default block; explicit opt-in stays PARTIAL even if comparison tasks finish. |
| Empty extracted events | Zero pairs exposed, not a clean-testimony claim. |
| Provider/JSON/truncation errors | Failed/partial status, raw response and known usage retained, no retries. |
| Cancellation/timeout/checkpoint failure | Stop further work appropriately; retain outcomes and pending-pair counts. |
| Label/report disagreements | Keep variants and flag disagreement; never average or auto-relabel. |
| Real Part 3 → Part 4 interface, mocked transports | Actual extracted event/result structures feed matching unchanged, with source/provenance checks. |
| Two synthetic 225-page manifests | All 50,625 event pairs accounted; distant selected comparison cites original pages 225 and 1. |
| Local checks | No paid calls, server startup, private sources or author/verifier artifacts. |
