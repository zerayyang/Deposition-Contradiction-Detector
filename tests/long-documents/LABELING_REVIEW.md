# Classification and review report checks

The source-context prompt addition reinforces existing categories; it does not
change scoring functions, numeric thresholds or approved gold. Use the independent
verifier only on approved cases, with explicit approval before paid requests.

Local checks: `npm run tests:documents` includes report tests, synthetic PDF source
recovery and rendered progress states. No server listeners or provider calls.
The report fixtures are fictional transport/UI data: an affirmation versus denial
is proposed DIRECT; other category fixtures test display, not the correctness of
an AI-generated label. No numeric calibration is asserted by these fixtures.

Manual expectations:
- Review report opens a local snapshot of ALL current findings, independent of the
  sidebar filter. AI categories and code statuses/scores are separate.
- Partial/failed/cancelled/legacy coverage cannot appear as complete. Rejected
  candidates are explicitly unverified and excluded from accepted totals.
- Only identical quote/category/source-location observations are grouped. Every
  explanation, score and note is preserved; semantic duplicates are not merged.
- Print/Save as PDF uses the browser. Download report saves a self-contained HTML
  snapshot including report annotations. Report notes do not modify the saved case.
- Download diagnostics includes the source transcripts and saved model responses,
  for local review. No new model request or third-party upload is made.
- Unknown categories remain visible for review. Untrusted testimony/notes cannot
  execute HTML or scripts. Pop-up blocking produces an actionable message.
- The timer waits explicitly for its first measurement, shows exact elapsed
  seconds, and never claims a measured estimate before any comparison completes.

Classification review checklist: reconstruct the proposition from the immediate
Q/A context; match entity, attribute, units, scope and event period; preserve
negation, hedges and corrections. An assertion hedge does not itself change DIRECT
into INFERENTIAL. Different testimony dates are not automatic reconciliation for
one historical event. A possible tension is not proof that either witness lied.

Without independent expected answers there is no measured accuracy rate for a
new real-document pair. Offline tests and prompt wording checks do not establish
an improvement in live classification accuracy. Preserve saved labels and report
disagreements rather than relabeling cases to make the app pass.

PDF-boundary recovery: repeated first-page headers and repeated multi-line footer
blocks after a printed Page marker can be mapped only when the same furniture is
confirmed on at least three PDF pages. Original characters and page references
remain preserved. Synthetic positive/negative checks cover continued answers and
insufficient repetition. Wording changes, ambiguity and unknown furniture remain
rejected; this is not semantic quote correction.
