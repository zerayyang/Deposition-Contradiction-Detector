# First event-index step: presence Q/A

Run `node --test server/presenceEvents.test.js`. Fixtures are fictional; no model,
private source documents, author records or approved labels are used.

The analysis input now includes a bounded presence index before each model call
when a section contains immediately adjacent `Were you at PLACE on/during OCCASION?`
and witness-answer turns. It retains literal source offsets, place and occasion,
affirmed/denied/unknown presence and unknown companions. Full original testimony
remains in the request. It does not extract every event, establish witness identity,
assign a category, change scoring, or treat a model omission as a found contradiction.
The model must still inspect all original testimony. Context/cost planning includes
the added input; no text is silently truncated. Sections without supported events
retain the previous request content.

Expected checks: clear yes/no presence answers are indexed; uncertainty, compound
questions and corrections remain unknown; a later unrelated hedge does not change
an explicit denial. Counsel remarks cannot supply witness answers. Different places
and occasions remain distinct. Question/answer offsets reproduce original text.
Other-people information remains unknown rather than false. A mocked request proves
that the index is present before model execution, not that live categorization has
improved. No extra API requests, extraction models or automatic retries are added.

This is a limited first event type. Named-speaker transcripts, unresolved references,
continued answers outside their section and other event kinds still need later work.
Matching indexes is a model aid, not deterministic proof that two events are identical.
