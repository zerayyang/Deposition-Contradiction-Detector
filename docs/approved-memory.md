# Part 7: approved private lessons

Status: implementation and offline tests; real Supabase migration/release and deployed
backend verification are separate steps. This is retrieval, not training model weights.
No accuracy improvement is claimed until Part 8's independent evaluation.

## User workflow

1. Finish reading both transcripts.
2. In **Saved progress & options**, optionally select **Use approved private lessons
   for this comparison**. It is off by default and does not affect extraction.
3. Review the comparison price. The preview identifies how many lessons were selected;
   their added prompt text is included in the estimate and conservative budget.
4. Approve the exact plan. Original testimony remains the only source of findings.
5. The saved comparison and printable report include lesson IDs, approval/release IDs,
   selection counts and a snapshot hash. Source/evidence rules and numeric confidence
   still come exclusively from existing deterministic code.

No eligible/relevant lessons means an explicitly reported zero, not invented memory.
A missing migration, lost access or database failure stops a memory-enabled plan.
Users can explicitly turn memory off. There is no silent fallback or background training.

## Database setup (not automatically applied)

Apply Part 6 first: `supabase/migrations/20261015_feedback_approvals.sql`.
Then apply `supabase/migrations/202610160001_approved_memory.sql` using your normal
migration process/SQL editor. No service-role key is used by the app. Backend variables
reuse `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (or their existing VITE variants).
The reader forwards the already authenticated user's Bearer token to one owner-scoped RPC;
no token is persisted in results, logs, plans or lessons.

Ordinary approval does NOT release feedback as production memory. An independently
assigned reviewer, signed in as that reviewer, must call the additional RPC:

```js
await supabase.rpc('release_feedback_memory', {
  p_example_id: exampleId,
  p_enabled: true,
  p_lesson: 'A short general reasoning lesson checked against the original sources.',
  p_search_terms: ['relevant action', 'relevant topic'],
  p_not_evaluation_material: true
})
```

The Stage 8 Review & Improve interface exposes submission, independent decisions and
explicit lesson release; see `docs/review-and-improve.md`. Reviewer assignments remain
an administrator operation.
Disabling the same example appends a release row with `p_enabled:false`; the latest
revision governs retrieval. Feedback approval revocation immediately excludes it too.
Owners cannot release their own feedback, forge release rows, or vote material into memory.
Admin reviewer assignment remains Part 6's explicit database administration step.

Write generalized lessons without names, court quotations, credentials or instructions.
No original testimony or reference analysis is automatically copied into model memory.
Release text is human-authored: the software cannot prove that a reviewer has not manually
pasted private/test content or approved an incorrect interpretation. The non-evaluation
attestation is a human responsibility, not an automatic contamination detector.

## Eligibility and isolation

The database returns only the requesting owner's explicitly released, active, independently
source-checked approvals from APP_SAVED_RESULT records. Reviewer access to another
owner's feedback does not grant that reviewer production retrieval of those lessons.
Current-case examples and matching input document hashes are excluded. Changed source
texts invalidate eligibility. The full source histories remain private; only curated lesson
text, category, search terms and approval IDs reach retrieval. Deleted cases cascade cleanup.

Author drafts, external reference findings, gold labels and verifier artifacts are never
read by this code. Approved tests do not automatically become lessons. Keep evaluation
cases held out; never release their answers as production memory.

## Retrieval and safety

A deterministic tokenizer compares reviewer search terms with both current source texts.
Stable lexical ranking selects at most three lessons; ties sort by ID. Conflicting categories
with identical matched-term signatures are withheld and counted. This narrow heuristic
cannot detect all semantic conflicts or guarantee relevance. Eligible pools over 100 stop
explicitly; no unseen rows are silently dropped. Other bounded omissions are audited.

Every current event block still crosses every other-document block. Retrieval never
filters current event pairs. Lessons are marked untrusted data, not instructions, current
source evidence, identity proof or missing context. Their IDs cannot become current citations.
Prompt boundaries reduce risk but do not guarantee immunity to misleading lesson text;
independent source/schema validation and human curation remain necessary.

The selected-content snapshot is part of immutable plan IDs and cost approval. The server
retrieves again when starting and before each uncached model call. A change/revocation or
lookup error stops further new calls and keeps an incomplete result. It cannot recall a
request already sent, and a database change immediately after a check can race that call.
No old completed comparison is silently reused under a different memory plan. Saved
historical results preserve their audit; revocation does not rewrite them as if never run.

## Checks and limits

`node --test tests/memory/*.test.mjs` uses fictional scripted records, in-process PostgreSQL
and mocked transports. It checks privacy, source changes, release/approval revocation,
relevance, explicit bounds, plan changes, extra prompt cost, invalid citations and score
injection, plus failure before new paid calls. No real approvals, cases or labels are changed.

The feature does not resolve backend startup errors, hosting time/body limits, extraction
mistakes, missing candidates or unsupported deterministic evidence patterns. It adds no
provider, dependency, embedding bill, training job or extra model request. A little more
input text can increase each comparison request's cost.
