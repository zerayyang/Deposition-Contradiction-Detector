# Synthetic citation/reading fixtures — expected behavior

No real testimony, gold labels or external analysis is included.

- `sanitized-brief.txt` is editorial prose containing a quoted Q/A and citation
  headings. Only the Q/A answer is a candidate witness span. The Source footer,
  Citation, Exhibit, Note, Footnote, See and Dep. lines are OTHER metadata, not
  named speakers. This checks structural parsing, not authenticity of a quote.
- Plain prose without Q/A or an explicitly assigned named witness must stop at
  planning until the user checks “this is witness testimony.” This is distinct
  from confirming that two documents have the same witness. The legacy low-level
  literal validator remains unchanged; both public planning entry points enforce
  this confirmation before it can use the unlabeled fallback.
- Rejection fixtures are mocked records: every prohibited source condition retains
  its own code, original proposed record and exact strict validation outcome.
  Redacted report previews are capped at 60 characters per side, never binding
  evidence, UI text or log fields. A private report may still contain private
  words; it is not anonymized for public sharing.
- The three-chunk mock has 13 short Q/A pairs in document one (two extraction
  requests) and one Q/A in document two (one request). Chunk one is partially
  rejected, chunk two has a known mock failure, chunk three succeeds. All are
  attempted once. Gaps and valid notes survive server recreation; there is no
  automatic failed-chunk retry. A finished read is READING_GAPS. Comparison
  requires acknowledgement bound to its current gap digest and a separate cost
  approval. Cancelled/unknown-in-flight work must not be restarted automatically.
- Valid NO_EVENT is processed, not proof no event occurred. Valid UNRESOLVED is a
  processed disposition with a visible interpretation gap, not a broken chunk.
- No comparison category or numeric score target is assigned by these fixtures.

Run only the focused files:
`node --test tests/events/rejection-codes.test.mjs tests/events/reading-gaps.test.mjs tests/events/brief-input.test.mjs`
All model transports are mocks. No server listener, network or provider calls.
