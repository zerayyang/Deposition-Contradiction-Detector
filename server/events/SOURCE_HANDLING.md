# Part 2: source roles and question links

This is deterministic source handling for the event-record foundation, not a new
model extractor or an automatic event comparison engine. No model call, database
migration, learned memory, classification-definition change or scoring-formula
change is included.

## One shared interpretation of source roles

`parseTestimonySource(text, options)` in `../testimonySource.js` reuses
`testimonyMarkers`. It returns ordered `turns`, `diagnostics`, `mode` and a notice.
Turn ranges `[start,end)` partition every character of the supplied document,
including labels and any preamble. `contentStart` points after the literal label.
Offsets are JavaScript UTF-16 indices in unchanged text. Keep the existing PDF
manifest to map offsets to original physical pages; no page numbers are inferred.

- Q/Question and A/Answer preserve supported numbered/punctuated formats.
- THE WITNESS is explicit witness speech. Court, clerk, counsel, reporter and
  honorific speaker turns terminate the preceding answer.
- Unmapped uppercase/name-like colon labels are boundaries with role OTHER.
  They are not evidence. The `UNKNOWN_SPEAKER` diagnostic retains their label and
  range. A heading resembling a name can therefore need manual resolution.
- An answer links only to the uninterrupted current question. An interruption
  clears the question frame; a fresh question restores it. No attempt is made to
  infer that an objection or recess implicitly resumed an earlier question.
- A second named witness cannot inherit the first witness's question. A fresh
  question for the new witness remains available. Unanswered earlier questions
  are excluded from answered-question history.
- All literal question turns remain preserved. The per-answer working history
  contains up to four recent answered/current questions, matching the existing
  assessment helper’s context window; it is not a replacement for full source text.
- Plain text without recognized labels remains supported as submitted witness
  text. `UNLABELED_INPUT` explicitly says that no speaker identity is established.
  An orphan answer remains literal testimony but gets `QUESTION_UNRESOLVED`.
  That warning does not assert its meaning or prohibit every independent fact.

## Explicit named speaker metadata

A trusted caller can supply exact labels after source review:

```js
const sourceOptions = {speakerRoles: {
  'MS. REED': 'QUESTIONER',
  'PRESIDENT VALE': 'WITNESS'
}};
parseTestimonySource(originalText, sourceOptions);
validateEventBundle(bundle, {documentId, text: originalText, pages, ...sourceOptions});
resolveWitnessSource(originalText, claim, sourceOptions);
// Existing assessment helper, if a trusted application caller has the metadata:
assessCandidate(candidate, text1, text2, {claim1: sourceOptions});
```

These names are fictional examples, not built-in mappings. Roles are WITNESS,
QUESTIONER or OTHER. Matching only normalizes label case and whitespace. It does
not infer surnames, aliases, title/person relationships or identity across files.
Invalid or conflicting mappings throw a TypeError; the event validator reports
SOURCE_OPTIONS. Reserved Q/A, THE WITNESS and court/officer roles cannot be
reassigned. Supplied roles are assertions by the caller, not independently proved
identities. Do not accept them from model output or blindly copy an HTTP body.

This part does **not** add a speaker-selection UI/API field or automatically fill
named roles from a document cover sheet. Unmapped roles stay unresolved in the
current app. Inline, lowercase-only, split/OCR-damaged or unusual labels need an
explicit mapping or a later parser extension; this is not universal format support.

## Validation and existing app behavior

`witnessQuoteMatches`, claim validation, literal source binding, assessment source
context and event validation share these rules. A model claim's `speakerRoles`,
`speaker` or `role` fields never grant witness status. Existing exact-quote,
question/answer-anchor, section-boundary and verified PDF-map checks remain in place.
Bound sources additionally identify the literal speaker label and role origin.
Event validation returns sourceDiagnostics even when proposed events are invalid.
Warnings are not silently turned into successful identity verification.

The default app parser now rejects unknown named turns as evidence and clears
context after other speakers. This can change whether a candidate has sufficient
verified context; numeric scoring formulas and classification definitions remain
unchanged. Named-role options are internal tooling support until a reviewed caller
supplies them. Original documents and saved-case shapes are unchanged.

Run `npm run tests:events` and the existing source/document regression suites.
Synthetic source tests and intended outcomes are documented in
`../../tests/events/EXPECTED_RESULTS.md`. Local passing tests establish specified
parser behavior, not live model recall, legal correctness or deployed quality.
