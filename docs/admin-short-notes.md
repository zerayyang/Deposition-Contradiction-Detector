# Short feedback notes

Correction explanations, review decisions, revocations and released lessons accept any nonblank text. Upper limits remain 4,000 characters for explanations and 1,500 for lessons. Reviewer authorization, source checks, stale-result rejection, search-term validation and explicit memory release remain required.

Apply `supabase/migrations/202610190003_short_feedback_notes.sql` in the Supabase SQL Editor after the feedback, memory and source-review migrations. This updates existing constraints and RPCs without changing saved records, permissions or scoring. Deploy the matching client/backend together; the old database will still reject short notes until upgraded. The migration was tested locally and has not been applied to production.

## Synthetic regression guide

`tests/feedback/short-notes.test.mjs` uses fictional accounts and answers only. Expected: short nonblank submit/review/lesson text succeeds; blank or oversized text fails; owners and unassigned users cannot approve; source acknowledgment and non-evaluation attestation remain mandatory. Short approved lessons are retrievable. Reapplying the migration preserves behavior.

Affected checks also cover historical database authorization, source changes, client validation, practice mode and memory retrieval. No real testimony, gold labels or model calls are needed.

# Progress display regression

During scoring, transcript rings report finished comparison work when explicit per-section counters are available. A completed partial comparison can show 100% processed with “partial results”; this never claims all evidence was validated. Unknown or unread work is not forced to 100%. Review details retain fully validated coverage counts and rejected findings.

The long progress bar follows scoring checks during scoring. The synthetic 21-of-56 case renders 37%; outside scoring it retains comparison progress. Existing stopped/unknown progress behavior is preserved.
