# Supabase connection

Install dependencies with `npm install`, then put these in the project-root `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Use only the publishable key in the frontend. Keep the Anthropic key in the existing server `.env`. Local environment files are ignored by Git.

Run `node start.mjs` as before. Create an account, confirm your email if requested, sign in, and save a case name. Reload to check that the name persists.

In Supabase Authentication → URL Configuration, set the Site URL to your actual local app address (normally http://localhost:5173), and allow that address as a redirect URL. Add the production address when deploying.

The existing `public.cases` table must contain `id`, `owner_id` (default auth.uid()), `title`, and `created_at`. Authenticated users need SELECT and INSERT grants. Enable Row Level Security with SELECT and INSERT policies restricting owner_id to auth.uid(). The client inserts only the title; the database assigns ownership.

This integration saves case names only. It does not yet save transcripts, files or findings. The analysis endpoint still needs authentication and rate limits before public deployment. Neither the AI prompt nor deterministic scoring was changed.

Files: src/lib/supabaseClient.js creates the connection; src/lib/caseStore.js reads/inserts cases; src/SupabaseCases.jsx handles account and case-list screens.
