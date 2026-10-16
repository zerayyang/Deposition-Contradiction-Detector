# Offline Stage 6 checks

Run `npm run tests:feedback`. See ../../docs/feedback-storage.md for fictional
fixture expectations, approval boundaries and limits. database.test.mjs executes the
migration against in-memory PostgreSQL with synthetic auth/cases, grants, RLS and
RPCs. client.test.mjs checks immutable payloads, explicit review, visible errors,
pagination and revocation handling. No private testimony, gold, author/verifier
artifacts, real Supabase connection, model calls or listening servers are used.

The proposed labels are scripted workflow inputs, not endorsed semantic corrections.
Local passes do not certify real legal accuracy or production multi-session locking.
