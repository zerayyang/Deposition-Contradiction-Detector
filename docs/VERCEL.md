# One Vercel project: Vite + Express

Select the Vite preset and this repository root. Build: `npm run build`; output: `dist`. `api/index.js` exports the root `server.js` entry, which re-exports the existing Express app. `/api/(.*)` routes to that function; Express routes retain their `/api/...` paths. No local listener or signal handlers are registered when VERCEL is set. Vite's existing local proxy is unchanged.

Set ANTHROPIC_API_KEY, SUPABASE_URL, DEMO_USER_IDS, and SUPABASE_PUBLISHABLE_KEY (sufficient for existing token checks) in Vercel environment settings. Keep VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for browser login. The service-role key and Anthropic key must never use VITE_ prefixes. Do not put real values in .env.example. SUPABASE_SERVICE_ROLE_KEY is reserved and unused; no new Supabase admin operations are implemented.

## Important deployment limits

This is a serverless adapter, not a durable analysis-worker migration. Local/persistent hosting retains disk checkpoints. Vercel disables that store: its filesystem and process-local active-job/cancellation/rate-limit state are not shared durable infrastructure. Cross-instance cancellation, recovery and global admission limits are not guaranteed. Results must finish on the original response. For durable resumable work, migrate the job store, locks and worker execution to shared services before relying on production long-document analysis.

The function starts at maxDuration 60 seconds. Existing analysis can exceed this: Vercel can terminate it before completion; provider work might still be billed. Vercel also imposes a 4.5 MB function request/response payload limit, regardless of the app's larger JSON budget. Large document requests may therefore be rejected before Express runs. The adapter does not remove those platform limits.

With Fluid Compute, Hobby allows 300 seconds; Pro/Enterprise allow 800 seconds generally, with up to 1800 seconds in the documented extended-duration beta for supported runtimes. Without Fluid Compute, maxima are Hobby 60, Pro 300, Enterprise 900 seconds. Confirm the account plan, runtime and enabled features in the dashboard; this repository does not establish the account's plan.

Sources: https://vercel.com/docs/functions/limitations and https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes

## Local checks (no model calls)

- `node --test tests/deployment/vercel.test.mjs`
- `npm run build`
- In one terminal: `npm start` (or `node server.js`). In another: `npm run dev`. Open the Vite URL and request `/api/health` through that URL. Both require your existing local environment configuration; no analysis is triggered by health checks.
- Optional deployment emulation with an installed Vercel CLI: `vercel dev --listen 5173`, then request `http://localhost:5173/api/health`. This step verifies Vercel routing; ordinary Vite development alone does not validate the deployed rewrite. Do not run alongside Vite on the same port.

No deployment, paid analysis, or account-plan inspection was performed as part of preparing this adapter.
