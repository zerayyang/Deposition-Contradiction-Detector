# Sham A independent source review

Reviewed all 13 originally included IDs against seven freshly downloaded public court PDFs. Both quotes and each cited ruling match contiguous extracted source text after whitespace-only collapse. Original words and punctuation were not normalized. Detector role markers were checked separately; reconstructed questions are marked and neutral. Court rulings remain outside detector inputs.

Result: 13 keep, 0 drop; 0 quote or label corrections. One contradictory audit-note sentence was removed from the Kabba research row. Two previously excluded rows were untouched.

The two DEBATABLE rows retain uncertain direct/inferential classification rather than converting a sham-affidavit disposition into an unsupported hard label. No human approval, gold promotion, app run, paid API call, or Git operation occurred.

| ID | Verdict | Basis |
| --- | --- | --- |
| hard-sham-a-moody-training | keep | Court expressly finds the same budget-training statements directly contradictory; DIRECT matches the pair-specific holding. |
| hard-sham-a-moody-intention-receipt | keep | Court states both can be simultaneously true: intent to inform versus knowledge of actual receipt; FALSE_POSITIVE matches. |
| hard-sham-a-moody-knowledge-opinion | keep | Court expressly distinguishes unsupported opinion from ignorance of a fact and rejects direct contradiction; FALSE_POSITIVE matches. |
| hard-sham-a-moody-recollection-omission | keep | Court treats the later statement as supplementation of qualified recollection, including possible temporary duties or imprecise plural usage; FALSE_POSITIVE matches. |
| hard-sham-a-prater-days-hours | keep | Court reads original schedule testimony as days rather than hours and expressly finds no contradiction; FALSE_POSITIVE matches. |
| hard-sham-a-prater-offhand-specific | keep | Court distinguishes qualified offhand recollection and day-specific questions from approximate undated occasions; FALSE_POSITIVE matches. |
| hard-sham-a-prater-knowledge-records | keep | Court distinguishes personal knowledge of clocking from observation of produced records and rejects contradiction; FALSE_POSITIVE matches. |
| hard-sham-a-obrien-required-instructed | keep | Court expressly adopts a limited compatible reading of required reporting time versus instruction by identified managers; FALSE_POSITIVE matches. |
| hard-sham-a-west-pay-raises | keep | Court expressly states the declaration directly contradicts prior pay-raise recommendation testimony; DIRECT matches. |
| hard-sham-a-kabba-message-conversation | keep | Court expressly finds message-based complaint compatible with inability to have an actual conversation; FALSE_POSITIVE matches. |
| hard-sham-a-maisha-health-insurance | keep | Court groups the insurance pair with attempts to bolster or contradict and excludes relevant paragraph 91; it does not classify this pair as direct or inferential. DEBATABLE retains that uncertainty. |
| hard-sham-a-goldenson-decision-reassurance | keep | Court rejects the sham objection and permits clarification of incomplete testimony; the independent withdrawal decision is compatible with earlier reassurance. FALSE_POSITIVE matches. |
| hard-sham-a-dins-additional-incident | keep | Court excludes unexplained additional incidents after exhaustive questioning but does not expressly classify the quoted qualified-recollection pair as direct or inferential. DEBATABLE retains that uncertainty. |
