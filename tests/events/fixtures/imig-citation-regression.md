# Imig citation regression — extraction only

Inputs are the exact PDF.js text and one-page extraction maps from the user-supplied
`02-imig-deposition-2-excerpt.pdf` and `01-imig-deposition-1-excerpt.pdf`, in that
saved case order. The excerpts identify Terry Imig's September 3 and February 11,
2015 depositions. Their Source footers identify Plaintiff-Appellant's Application
for Leave to Appeal, Menard v. Imig, Michigan Supreme Court No. 158563, filed
October 18, 2018; the excerpt introductions retain original transcript/filing page
references. They are excerpts, not complete depositions. The separate lawyer
reference PDF was not consulted or included.

Expected behavior (independent of observed results):
- Keep all original text, line breaks, introductory metadata, omission marker,
  footer and offsets. Introductory material is unattributed. Reviewed `Source:
  OTHER` separates the footer from the last witness answer.
- One and three supported witness answers respectively, each with its own question.
- Replay the saved model transport unchanged: reject its sole event with
  `QUALIFIER_NOT_LITERAL`. Its “that you believe” phrase is exact question wording,
  not witness wording. The “No.” answer is still incomplete after rejection.
- Keep raw output and rejection details; block comparison, show the exact reason
  and approval-required recovery. Do not silently remove the offending qualifier.
- A separate valid mock with separate question/answer citations processes all four
  answers with exact offsets. This demonstrates contract behavior, not live model
  quality, exhaustive recall, or a correct classification.
- No DIRECT/INFERENTIAL/FALSE_POSITIVE expectation is set here. Extraction does not
  classify comparisons. Numeric scores are not calibrated or graded by this test.

Run: `node --test tests/events/imig-citations.test.mjs`.
No model requests, billing, deployment, or author/gold edits occur.
