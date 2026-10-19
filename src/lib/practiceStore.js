// Practice review: the same decision and lesson rules as the real database functions,
// kept in memory. Nothing is sent to Supabase and no lesson ever reaches the AI.
const PRACTICE_OWNER = "00000000-0000-4000-8000-0000000000aa";
export const PRACTICE_PROPOSAL = Object.freeze({
  id: "00000000-0000-4000-8000-0000000000bb", owner_id: PRACTICE_OWNER, proposed_type: "FALSE_POSITIVE", created_at: "2026-01-01T00:00:00Z",
  rationale: "Practice example (fictional): the witness was describing two different evenings, so both answers can be true.",
  original_snapshot: { finding: { type: "DIRECT", claim1: { original: "I was home all evening." }, claim2: { original: "I went out around eight." } } },
});
const SOURCES = Object.freeze({ caseTitle: "Practice case (fictional)", sourcesUnchanged: true, findingUnchanged: true,
  transcript1: "Q. Where were you on Monday night?\nA. I was home all evening.", transcript2: "Q. And on the Tuesday?\nA. I went out around eight." });

export function createPracticeStore() {
  let revision = 0, decision = null, example = null, release = null;
  const fail = message => { throw new Error(message); };
  return {
    practice: true,
    async canReview() { return true; },
    async reviewSources() { return SOURCES; },
    async reviewState() { return { decision, example, release }; },
    async review({ decision: choice, rationale, sourceChecked, expectedDecisionId }) {
      if (!["APPROVE", "REJECT", "NEEDS_CONTEXT", "REVOKE"].includes(choice) || typeof rationale !== "string" || rationale.trim().length < 10 || rationale.length > 4000) fail("Invalid review fields: write at least 10 characters.");
      if ((decision?.id ?? null) !== (expectedDecisionId ?? null)) fail("Review changed. Reload the latest decision before submitting.");
      if (decision?.decision === "APPROVE" && choice !== "REVOKE") fail("Revoke the current approval explicitly before another decision.");
      if (choice === "REVOKE" && decision?.decision !== "APPROVE") fail("Only a currently approved correction can be revoked.");
      if (choice === "APPROVE" && !sourceChecked) fail("Explicit source review is required for approval.");
      revision++;
      decision = { id: `practice-decision-${revision}`, revision, decision: choice, rationale };
      example = choice === "APPROVE" ? { id: `practice-example-${revision}` } : null;
      release = null;
      return decision.id;
    },
    async releaseMemory({ enabled, lesson, searchTerms, notEvaluationMaterial }) {
      if (!example) fail("Approve the correction before releasing a lesson.");
      if (notEvaluationMaterial !== true) fail("Confirm the lesson contains no private case details.");
      if (typeof lesson !== "string" || lesson.trim().length < 10 || lesson.length > 1500) fail("Write a lesson of at least 10 characters.");
      if (!Array.isArray(searchTerms) || searchTerms.length < 1 || searchTerms.length > 16 || searchTerms.some(t => typeof t !== "string" || t.trim().length < 2 || t.length > 60)) fail("Add 1–16 search phrases, each at least 2 characters.");
      release = { enabled, lesson: lesson.trim(), search_terms: searchTerms.map(t => t.trim()) };
      return true;
    },
  };
}
