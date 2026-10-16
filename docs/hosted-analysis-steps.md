# Hosted analysis steps

Vercel now executes one new model request per HTTP invocation. The existing private Supabase `case-originals` bucket holds immutable job manifests, claims, cost reservations and result checkpoints under the owned case folder. Existing case ownership policies apply; no public bucket or service-role key is needed. Case deletion removes the flat checkpoint files with its other originals.

Enable Fluid Compute for the existing Vercel project before deploying the 300-second function duration. Each model call has a 240-second bound, leaving time for private persistence. Neither bound guarantees that an unusually slow provider request completes.

A signed-in user saves a case, reviews the plan and its spending allowance, then starts sequential steps. The browser starts another step only after the preceding checkpoint is saved. Closing the tab pauses later work; an already-started request may still finish and be billed. Restore hosted progress reads saved state without a model call. Reading and event comparison still require separate approvals.

Checkpoint signatures use server-only `ANALYSIS_JOB_SIGNING_KEY`, falling back to the existing server-only Anthropic key. Never expose either in a Vite variable. Rotating the signing key makes old signed checkpoints unreadable; export needed results first. A changed backend build blocks further paid resume of the old job but leaves readable saved progress when the signing key is unchanged.

Unknown completion, duplicate step claims, cancellation, storage failures and timeouts never automatically retry a paid call. Partial and rejected source results remain visible. Review them before approving another job. This is resumable browser-driven work, not an always-running background worker.

The displayed USD amounts use configured provider rates, not verified billing. Each step reserves a conservative upper estimate before transport; missing usage retains that reservation. A smaller explicitly approved allowance can stop before full coverage. Job budgets are per job; a multi-job test must additionally track its aggregate spending cap. Saved requests/results may consume substantial private storage; checkpoints above 32 MiB fail explicitly.

A hosted job start exceeding Vercel's request payload bound is rejected before paid work. The UI currently guards at 4 MiB; larger combined extracted payloads need a storage-reference transport enhancement. Documents are never truncated to fit. No scoring formula or contradiction definition changes in this transport update.

Local checks: `node --test tests/deployment/*.test.mjs tests/events/*.test.mjs tests/long-documents/*.test.mjs tests/reliability/*.test.mjs` and `npm run build`. Mocked passes do not establish live identification quality. Verify deployed health/build identity, private storage access and the actual full-document run separately.
