# Bounded confidence concurrency

Synthetic fixtures: `tests/confidence/concurrency.test.mjs`. These test scheduling, budgets and retention, not classification or score calibration.

- The app opts into at most two findings per wave when the server advertises support. Older allowances use the unchanged serial flow.
- Each finding retains seven ordered checks, the same models, source context and scoring inputs. Discovery analysis and the borderline recheck still finish first.
- Free plans are allocated in order using immutable records. The new ledger reserves both in-flight findings against the same approved allowance. A third active reservation or mixed allocation mode is rejected. Duplicate indices cannot create a second paid plan.
- Complete recorded usage releases unused reservation. Incomplete, failed, missing or unknown work retains its full reservation. No paid step is retried.
- If the second free plan cannot fit while the first is reserved, finish the first wave and reconsider the free plan after usage settles. If it still cannot fit, stop with budget status. This is a free planning deferral, not a paid retry.
- Checkpoint callbacks serialize immutable snapshots so an older save cannot overwrite newer scores. Cancellation/failure stops new work, drains started requests and retains returned votes. In-flight cancelled work can still be billed.

Expected checks: four findings make 28 mocked calls with peak concurrency two, each job ordered 0–6; caps cannot be exceeded; tightly funded runs may remain serial; cancellation/failure/checkpoint errors stop later steps; source rejection and old-capability fallback remain safe.

Run `node --test tests/confidence/concurrency.test.mjs tests/confidence/automatic.test.mjs tests/confidence/handlers.test.mjs tests/confidence/capped-preview.test.mjs`.
Real provider speed and rate limits remain unmeasured. Peak two is a concurrency bound, not a promised speed multiplier or cheaper pricing.
