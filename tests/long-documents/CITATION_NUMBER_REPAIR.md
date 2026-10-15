# Citation and quantity regression checks

Run locally (mock responses only; no server or paid calls):

```
node --test server/sourceBindings.test.js server/scoring/quantities.test.js tests/long-documents/source-bindings.test.mjs src/lib/reviewReport.test.js
```

These fixtures are fictional and test machinery, not approved detector accuracy or calibrated scores. Existing author drafts/gold are untouched.

Expected source behavior:
- Counsel/court turns terminate a witness answer; their words cannot validate as witness evidence. Explicit THE WITNESS turns can resume witness speech.
- A distinctive literal `sourceQuestion` or longer `sourceAnswer` can bind a repeated quote to one witness occurrence in its submitted section. Anchors cannot invent text or use AI reasoning as a locator. Invalid anchors stay unverified; absent/nonunique anchors remain ambiguous and unscored.
- Full original question/answer context, character offsets, stable occurrence ID and all selected PDF pages are retained. Two pages of one answer are not two possible occurrences.
- Old results without anchors remain supported; no previously saved case is rewritten. Identical quote pairs at different bound locations are never merged.
- Short affirmative answers do not acquire examiner facts automatically; location verification is distinct from interpreting the adopted proposition.

Expected numeric behavior:
- `2,000 acres` = exactly 2000, not 0–2. Decimal and explicit million/billion scales retain magnitude.
- Explicit ranges can share a trailing scale (`between 1 and 1.5 billion`). CAD/USD labels remain distinct.
- Existing approximation tolerance/weights are unchanged. Unsupported wording such as `tens of millions`, `a billion five`, malformed commas, mixed ambiguous scales and open-ended bounds returns null. No invented numeric bounds.
- Better parsing alone does not prove same parcel, valuation date, actor, hypothetical basis or quantity scope. Existing scoring guards still apply. This patch does not widen hypothetical or topic/date rules.

Report expectations: selected Q/A is expandable, unresolved sources warn, old results disclose missing binding metadata. Downloaded reports remain self-contained and escape testimony text.

Limits: speaker recognition covers explicit Q/A and supported named counsel/court labels, not arbitrary unlabeled speaker changes or OCR repairs. New model anchor compliance requires separately authorized live verification; local mocks cannot establish model accuracy. No model was changed and no paid analysis was run by these tests.
