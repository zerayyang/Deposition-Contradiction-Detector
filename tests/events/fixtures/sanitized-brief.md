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
