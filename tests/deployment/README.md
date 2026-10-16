# Website checks — fictional responses, zero paid calls

Run `node --test tests/deployment/*.test.mjs`, then `npm run build`.
These checks do not start a server or contact Claude/Supabase. Existing auth,
source binding, scoring, PDF, cancellation and partial-result regressions remain
in their respective local suites. Author records and approved labels are unused.

Expected outcomes:
- Vercel exports the Express app without listening on a port; health remains free.
- A short fictional signing affirmation/denial previews without a model call,
  refuses an unapproved plan, and returns one DIRECT, literal-source finding with
  a complete result when a local model stub succeeds. This verifies transport,
  not live classification accuracy or a calibrated numeric score.
- HTML/plain-text hosting errors produce understandable messages without exposing
  response bodies or JSON syntax errors. No retries or hidden model calls occur.
- An HTML page cannot be accepted as an analysis stream. Interrupted/unreadable
  streams cannot appear complete; earlier callbacks remain available to the UI.
- Vercel's disabled disk store is reported honestly. Cloud-save failures promise
  server recovery only if the response explicitly enabled it; otherwise the user
  must keep the tab open and retry saving to their private case.

Deployment remains a separate check: configure Vercel environment variables,
inspect the deployed page and `/api/health`, and test an authenticated plan preview.
A real analysis costs Claude credits and needs separate explicit approval.
No local check establishes that a deployed environment has valid credentials.
