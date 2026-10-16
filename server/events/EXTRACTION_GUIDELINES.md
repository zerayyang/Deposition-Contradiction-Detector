# General event extraction guidelines — design reference

Part 1 defines the output contract. It does not call a model, modify the current
prompt, classify contradictions, match records across documents or calculate scores.
Part 3 now implements an isolated extractor with its own EXTRACTION_PROMPT.md
and source-unit transport; see EXTRACTION.md. This design reference is not loaded
into the current analysis prompt, and the UI has not switched to the new extractor.

## Task

Read every assigned source range. Extract distinct witness assertions about events,
actions, states or observations, including denials, uncertainty and corrections.
Use descriptive event kinds and attribute names; there is no fixed list of allowable
events. Do not turn every noun into a separate event. A record describes testimony,
not proof that the event happened. Preserve distinct occasions and separate people.

Return JSON matching `schema.v1.json`. The application supplies `documentId`, the
SHA-256 of the original text, assigned ranges and any PDF map. Never guess those
identifiers, offsets or page numbers. Source offsets are zero-based UTF-16 code-unit
positions, end-exclusive, in the unchanged document; they are not UTF-8 byte offsets.

## Literal fields and uncertainty

- Use exact contiguous witness quotations. Never stitch passages, rewrite punctuation,
  insert a lawyer's words into a witness quotation or choose the first repeated quote.
- Preserve the governing question separately when an answer adopts its proposition.
  A question cannot by itself establish a witness assertion.
- `STATED` attribute values are exact text inside a referenced source. Mark whether
  the literal phrase came from witness words or question context. Question context
  remains a proposed interpretation; it is not independently verified witness fact.
- Missing information: `UNSTATED`, value null, basis NONE, no claimed source.
  Ambiguous interpretation: `AMBIGUOUS`, value null, basis NONE, with relevant sources,
  reviewRequired true and an explanation. Unknown companions never mean nobody.
- Do not infer dates, years, people, locations, quantities or event identity. Preserve
  literal time/quantity expressions; deterministic normalization is a later stage.
- Keep affirmation, denial, uncertainty and unknown polarity separate. An uncertain
  affirmation is not a denial. Record the literal qualifiers and their proposed scope;
  approximation of a value is different from uncertainty about whether an event occurred.
- Preserve corrections and their original claims as separate linked records. Do not
  overwrite or automatically count a correction as an independent contradiction.
- A name in a question, a generic 'I', or the same role in two documents does not prove
  that both documents concern the same person. Unresolved identities need review.
- Do not provide confidence, numeric scores, probabilities, evidence strength or a
  DIRECT/INFERENTIAL/FALSE_POSITIVE comparison label in this extraction contract.

## Coverage and boundaries

Account for the entire supplied document with ordered, non-overlapping segments.
PROCESSED means extraction was attempted, not that every event was found. Unprocessed
and failed spans need reasons. Never silently skip, truncate, fix or discard a record.
Every event source must fit a processed segment that names the event. A witness answer
continued across boundaries must retain its governing source context in later stages;
Part 1 cannot infer omitted context. Original source text is always the authority.

Unsupported speaker formats, ambiguous source occurrences, source-role disagreements,
invalid JSON and unsupported interpretations must remain visible failures. Part 2
source handling accepts exact named roles only from trusted caller metadata; the
model cannot assign itself witness authority. Unmapped named speakers stay unresolved.
See SOURCE_HANDLING.md. There is no automatic cover-sheet identity inference.

## Memory and evaluation separation

These general guidelines are not learned memory. No case is automatically promoted
into a reusable example. Private testimony, author analyses and held-out evaluation
answers must not become production examples. Reviewed memory, database persistence,
live extraction calls and comparisons require separate explicit approval.
