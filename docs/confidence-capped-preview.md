# Confidence capped preview

The synthetic fixtures in `tests/confidence/capped-preview.test.mjs` test spending approval and retention, not detection accuracy or numeric confidence calibration.

Expected behavior:
- A workload forecast above the configured ceiling produces a free preview containing the full forecast, offered cap and ceiling. It never increases the ceiling.
- A smaller offer explicitly warns that confidence coverage may be incomplete. Both client and server require deliberate acknowledgement before confidence allocation.
- If one estimated confidence review cannot fit, the combined Start button remains disabled. A different source excerpt or explicit server configuration decision is required.
- Actual per-finding costs remain strictly reserved; unknown usage consumes the full reservation. Exhaustion retains completed scores and all analysis findings, leaves remaining scores null, and makes no automatic retries.
- Under-ceiling offers preserve the normal one-approval flow. Explicit over-ceiling requests still fail.

Run `node --test tests/confidence/capped-preview.test.mjs tests/confidence/automatic.test.mjs tests/confidence/handlers.test.mjs`.
All model responses are mocked. A successful preview does not guarantee full scoring coverage, live provider success or any finding's correctness. The prior conservative estimator is unchanged; the fix makes its capped offer explicit rather than blocking before cost approval.
