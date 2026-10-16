# Reliability and private-demo handoff

## What is implemented

- Literal source citations and quantity parsing from the previous repair remain in place.
- Context carryover is bounded to nearby explicit follow-ups. Topic resets, current-status questions and a newly stated date stop older date inheritance. This conservative rule may leave implicit context unresolved; it never guesses a date.
- “I would say” is distinguished from actual hypothetical testimony. Explicit habitual “would” is supported only with a literal routine/recurrence frame; genuine conditions and unsupported modals remain blocked. No classification definitions or scoring weights were changed.
- The UI streaming workflow writes a private atomic server checkpoint before each next model request and before sending completed results. Files are flushed and renamed; a failed checkpoint stops later paid calls. A restart detects unfinished work instead of claiming completion.
- Inputs are saved to the existing Supabase case before analysis; checkpoints are also copied to that case during streaming. Original PDFs remain private in Supabase. Replaced originals remain available for old recovery records; deleting a case cleans recovery copies first, then its case/originals.
- Saved analysis recovery can restore results without AI calls, cancel a stranded running job, and preview the remaining cost before resuming. Successfully completed requests are skipped. Failed/partial requests may need another paid request; accepted prior findings and attempt history remain visible. In-flight work at interruption can still be billed. No automatic retry or automatic resume.
- Recovery requires the same prompt, plan and server-code/dependency fingerprint. Changed software refuses resume; old results can still be recovered/exported.
- Reports retain original model text, response digests, stop reasons, usage, model/prompt/code identifiers and timing. Logs contain run IDs, counts, durations, token usage and error categories, not source text, tokens or API keys.
- One heavy request is admitted at a time, before parsing JSON; excess work returns 429 with Retry-After. Per-identity API rate limits and request/cost-estimate allowances protect the private demo. This is rejection with manual retry, not a job queue.
- Public hosting requires verified Supabase user tokens and an explicit demo user allowlist. Local loopback requests can retain the legacy verifier workflow; local mode binds 127.0.0.1. Health checks make no AI calls.

## Local startup and checks

Do not restart while a paid run is active. When ready:

```
node start.mjs
```

Open http://localhost:5173. Select a saved case; expand **Saved analysis recovery**. Entries from before this implementation have no server recovery record. Recover/refresh/delete controls do not call a model. **Review cost to resume** only previews; **Start N paid requests** authorizes paid work.

```
npm run tests:reliability
npm run tests:load
npm run tests:documents
node --test server/*.test.js server/scoring/*.test.js
```

All reliability/load fixtures use mock provider responses and no listening server. The crash check actually kills a separate worker process containing fictional inputs. Companion expectations: tests/reliability/README.md.

## Hosting configuration (not deployed by this work)

Use one Node 24+ service instance, build `npm ci --include=dev && npm run build`, start `npm start`. Configure TLS on the hosting platform, `NODE_ENV=production`, `PORT`, Anthropic key, Supabase URL/publishable key, `DEMO_USER_IDS` (actual allowed user UUIDs), and `ANALYSIS_JOB_DIR` on a private persistent volume outside dist/public. Configure `/api/health` as the health endpoint. Frontend VITE_SUPABASE_* values are needed during build. No service-role key is needed. Set the Supabase auth site/redirect URLs to the actual demo origin before inviting users.

Recovery records contain confidential testimony and model output. Default local directory `.analysis-jobs/` is git-ignored; files are mode 0600 and newly created directories mode 0700. Existing directory permissions, backups, encryption at rest and host access must be configured by the operator. Ten recovery records per user and 64 MiB per record are the default quota; export/delete old recovery copies when full. Disk exhaustion fails closed. Persistence on an ephemeral host is insufficient. Losing both the persistent volume and Supabase copies is outside this recovery mechanism; keep independent backups and test restore.

Default server allowance: 12 requests and USD 25 conservative estimated budget per analysis/resume; configure MAX_ANALYSIS_REQUESTS and MAX_ANALYSIS_BUDGET_USD. These estimates are not a provider-enforced billing cap. Also set provider account spending controls. In-flight cancellation/timeout can still incur a charge.

This filesystem implementation is **single process / single instance**. Do not use multiple workers or rolling instances against the same recovery directory. Distributed queues/database jobs would be a separate scaling change. Host proxy limits and real HTTP load/capacity must be checked in a separate staging deployment. Render's persistent disks are single-instance: https://render.com/docs/disks . Server-side identity verification follows https://supabase.com/docs/reference/javascript/auth-getuser .

## Honest acceptance limits

Local checks demonstrate mechanics, not real-model classification accuracy, calibrated confidence or production throughput. The mock load report deliberately labels its timings as mock-only. Unsupported propositions remain NOT_EVALUABLE with null numeric scores. No gold labels, author data, model provider, or model were changed. No memory system or cron job was added. No paid API call, server startup, or deployment is needed for these checks.

The legacy one-request `/api/analyze` endpoint is retained for compatibility and does not create UI recovery jobs; use `/api/analyze/stream` with caseId for durable UI analysis. New endpoints are authenticated in hosting: GET jobs?caseId, GET jobs/:id, POST jobs/:id/cancel, DELETE jobs/:id under /api/analysis/. Resume uses resumeJobId and caseId in the plan and stream bodies, plus explicit approvedPlanId in stream.

## Commit point

Local checks for this batch: 169 distinct regression checks passed; targeted ESLint and production build passed. The separate mock load run admitted 5 of 100 attempts, rejected 95 as overload, and had zero unexpected errors. These are mocked measurements, not live AI results. No paid call, server startup, deployment, commit or push was performed.

The following deliberately groups related earlier report/timer/PDF-layout changes with recovery, so the committed UI includes its report-module dependencies. It excludes AGENTS.md, author batches/reviews, gold labels, generated reports and private recovery records. Review the staged diff before committing; do not add private .env files.

```bash
cd '/Users/zerayyang/Desktop/Deposition Contradiction '
git add -- .gitignore .env.example package.json vite.config.js \
  server/app.js server/server.js server/analysisHandlers.js server/documentAnalysis.js \
  server/humanConfidencePipeline.js server/scoring/rules.js server/sourceContext.js \
  server/contextReliability.test.js server/jobStore.js server/runtimeControls.js \
  server/authentication.js server/configuration.js server/pdfQuoteGrounding.js server/proper_prompts.md \
  src/App.jsx src/AnalysisStatus.jsx src/RecoveryPanel.jsx src/lib/analysisClient.js \
  src/lib/analysisStatus.js src/lib/analysisStatus.test.js src/lib/recovery.js src/lib/recovery.test.js \
  src/lib/reviewReport.js src/lib/reviewReport.test.js \
  tests/long-documents/recovery.test.mjs tests/long-documents/status-rendering.test.mjs \
  tests/long-documents/LABELING_REVIEW.md tests/reliability docs/RELIABILITY_AND_DEMO.md
git diff --cached
git commit -m "Harden analysis recovery, context handling and review reports"
```
