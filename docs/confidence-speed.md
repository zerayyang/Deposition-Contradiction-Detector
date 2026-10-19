# Scoring latency changes

Synthetic fixtures and expected behavior: `tests/confidence/speed.test.mjs`.

1. Keep the two slots continuously busy. When one finding finishes, start the next without waiting for its slower peer. Free planning joins the bounded confidence admission lane. The same immutable shared budget ledger still limits outstanding reservations to two.
2. New UI offers request `compact-v1`: the same seven calls, models and full question/answer/quotation context, with at most three short concerns requested and 768 output tokens rather than 2048. Definitions, source checks, formula and retry policy are unchanged by this speed change.
3. Profile is bound to the saved allowance and paid plan. Existing offers/plans remain on the 2048-token legacy profile. A caller cannot change a saved paid request profile during replay. Pricing reserves match the selected profile.

Expected checks: synthetic third finding starts before its deliberately slow predecessor finishes; peak two and exactly 21 calls; compact request preserves all source messages/models and reduces the output reserve; saved replay makes no new call; max-token stop remains incomplete with no numeric score or paid retry.

No document text is silently truncated. A compact model output can still hit its output limit: this remains an explicit failure rather than an automatic more-expensive retry. The compact-response change needs a capped live evaluation before claiming preserved classification performance.

No real provider timings measured; no guarantee of finishing within four minutes. Long context, number of findings, storage latency, unchanged server rate limits and provider load still affect completion time. This change does not overlap scoring with original analysis or reduce seven requests per eligible finding.

Run `node --test tests/confidence/speed.test.mjs tests/confidence/concurrency.test.mjs tests/confidence/automatic.test.mjs tests/confidence/handlers.test.mjs tests/confidence/capped-preview.test.mjs tests/reliability/controls.test.mjs`.
