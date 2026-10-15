import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBatch, planBatch } from './batch.mjs';
import { atomicJson, digest, readJson, validateCase, validateGenerated } from './schema.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (id = 'synthetic') => ({ id, transcript1_text: 'Synthetic question: open? Yes.', transcript2_text: 'Synthetic question: open? No.', expected_type: 'DIRECT', expected_evidence: 'CONFLICT', expected_score_band: 'STRONG', tricky_feature: 'synthetic author workflow fixture', rationale: 'Synthetic answers differ.', status: 'draft' });
const decision = (extra = {}) => ({ batch_id: 'unit-batch', reviewed_by: 'AI', approved_by: 'zerayyang', approval_date: '2026-10-14', approval_source: 'explicit user batch instruction', approved_ids: ['synthetic'], draft_ids: ['held'], type_only_ids: [], case_updates: {}, hold_reasons: { held: 'Pending wording review.' }, ordinal_groups: {}, ...extra });
const input = (d = decision()) => ({ drafts: [fixture(), fixture('held')], gold: [], decision: d });
const reviewed = c => ({ ...c, status: 'approved', human_review: { explicit_human_review: true, method: 'interactive-readline', reviewer: 'zerayyang', decision: 'approve', content_sha256: digest(c) } });
async function setup(run) {
  const root = await fs.mkdtemp(path.join(here, '.batch-unit-'));
  try {
    await atomicJson(path.join(root, 'gold.json'), []);
    await atomicJson(path.join(root, 'gold.draft.json'), input().drafts);
    await run(root);
  } finally { await fs.rm(root, { recursive: true }); }
}
test('partition rejects omissions, overlap, duplicate IDs and unknown IDs', () => {
  for (const d of [decision({ draft_ids: [] }), decision({ draft_ids: ['held', 'synthetic'] }), decision({ approved_ids: ['synthetic', 'synthetic'] }), decision({ approved_ids: ['missing'] }), decision({ type_only_ids: ['held'] })]) assert.throws(() => planBatch(input(d)), /Partition|duplicate|overlap|Unknown|not approved/);
});
test('batch requires exact provenance and permits no source, type, rationale or band updates', () => {
  for (const key of ['approval_source', 'reviewed_by', 'approved_by', 'approval_date']) assert.throws(() => planBatch(input(decision({ [key]: 'wrong' }))), /provenance/);
  for (const key of ['expected_type', 'transcript1_text', 'transcript2_text', 'rationale', 'expected_score_band', 'id', 'status', 'human_review']) assert.throws(() => planBatch(input(decision({ case_updates: { synthetic: { [key]: 'changed' } } }))), /Forbidden case update/);
  assert.throws(() => planBatch(input(decision({ case_updates: { missing: {} } }))), /Unknown ID/);
  assert.throws(() => planBatch(input(decision({ batch_id: '../escape' }))), /batch_id/);
});
test('type-only evidence is informational, band preserved, and fresh generation remains strict', () => {
  const p = planBatch(input(decision({ type_only_ids: ['synthetic'], case_updates: { synthetic: { expected_evidence: 'depends on implemented rules', code_support: { source: 'synthetic audit reference' } } } })));
  const c = p.next_gold[0];
  assert.equal(c.expected_score_band, 'STRONG');
  assert.equal(c.review_policy.evidence_assertion, 'informational');
  assert.equal(c.review_policy.approval_scope, 'TYPE_ONLY');
  assert.equal(c.review_policy.band_assertion, 'informational');
  assert.equal(c.human_review.explicit_human_approval, true);
  assert.equal(c.human_review.explicit_human_review, false);
  assert.equal(c.human_review.human_verified, false);
  assert.equal(c.human_review.content_sha256, digest(c));
  assert.throws(() => validateCase(c), /Unexpected field/);
  assert.throws(() => validateGenerated([c], []), /Unexpected field/);
  assert.throws(() => planBatch(input(decision({ case_updates: { synthetic: { expected_evidence: 'depends on implemented rules' } } }))), /Invalid expected_evidence/);
  assert.throws(() => planBatch(input(decision({ case_updates: { synthetic: { expected_evidence: 'NOT_EVALUABLE' } } }))), /null exactly when/);
});
test('approval policy and support participate in digest and provenance cannot falsely claim human review', () => {
  const c = planBatch(input()).next_gold[0];
  assert.notEqual(digest(c), digest({ ...c, code_support: { reason: 'new audit' } }));
  assert.notEqual(digest(c), digest({ ...c, review_policy: { ...c.review_policy, approval_scope: 'TYPE_ONLY', evidence_assertion: 'informational' } }));
  assert.throws(() => validateCase({ ...c, code_support: { changed: true } }, { statuses: ['approved'], allowReview: true }), /hash mismatch/);
  assert.throws(() => validateCase({ ...c, human_review: { ...c.human_review, human_verified: true } }, { statuses: ['approved'], allowReview: true }), /requires explicit human review/);
  assert.throws(() => validateCase({ ...c, human_review: { ...c.human_review, human_verified: true, explicit_human_review: true } }, { statuses: ['approved'], allowReview: true }), /Only the previously/);
});
test('previous gold and exact human review are preserved in the audit before scope updates', () => {
  const before = reviewed(fixture('sample-home'));
  const other = reviewed(fixture('previous-approved'));
  const p = planBatch({ drafts: [before, fixture('held')], gold: [before, other], decision: decision({ approved_ids: ['sample-home'], type_only_ids: ['sample-home'] }) });
  assert.deepEqual(p.events[0].previous_gold, before);
  assert.deepEqual(p.events[0].previous_draft, before);
  assert.equal(p.next_gold[0].human_review.human_verified, true);
  assert.equal(p.next_gold[0].human_review.explicit_human_review, true);
  assert.equal(p.next_gold[0].human_review.approval_scope, 'TYPE_ONLY');
  assert.deepEqual(p.next_gold[1], other);
  assert.throws(() => planBatch({ drafts: [before], gold: [before], decision: decision({ approved_ids: [], draft_ids: ['sample-home'], hold_reasons: {} }) }), /Cannot demote/);
});
test('holds remain drafts with reason and optional ordinal groups; invalid policy is refused', () => {
  const p = planBatch(input(decision({ ordinal_groups: { synthetic: { ordinal_pattern: 'time', ordinal_role: 'EXACT_DIRECT' } } })));
  assert.equal(p.next_drafts[1].status, 'draft');
  assert.equal(p.next_drafts[1].review_policy.hold_reason, 'Pending wording review.');
  assert.equal(p.next_drafts[1].human_review, undefined);
  assert.equal(p.next_gold[0].review_policy.ordinal_role, 'EXACT_DIRECT');
  assert.throws(() => planBatch(input(decision({ case_updates: { synthetic: { review_policy: { band_assertion: 'required' } } } }))), /Conflicting/);
  assert.throws(() => planBatch(input(decision({ ordinal_groups: { synthetic: { ordinal_pattern: 'time' } } }))), /occur together/);
});
test('batch saves full originals, decision, plan and completed-file journal with exclusive ID guard', async () => setup(async root => {
  const goldBefore = await fs.readFile(path.join(root, 'gold.json'), 'utf8');
  const draftBefore = await fs.readFile(path.join(root, 'gold.draft.json'), 'utf8');
  const result = await applyBatch({ root, decision: decision() });
  assert.equal(result.approvedCount, 1); assert.equal(result.draftCount, 1);
  assert.equal(await fs.readFile(path.join(result.reviewDir, 'gold.before.json'), 'utf8'), goldBefore);
  assert.equal(await fs.readFile(path.join(result.reviewDir, 'gold.draft.before.json'), 'utf8'), draftBefore);
  assert.deepEqual(await readJson(path.join(result.reviewDir, 'decision.json')), decision());
  const progress = await readJson(path.join(result.reviewDir, 'progress.json'));
  assert.equal(progress.state, 'complete'); assert.deepEqual(progress.completed_files, ['gold.json', 'gold.draft.json']);
  assert.equal((await readJson(path.join(root, 'gold.json')))[0].status, 'approved');
  await assert.rejects(() => applyBatch({ root, decision: decision() }), /EEXIST/);
}));
test('invalid decision cannot create archive or change source files', async () => setup(async root => {
  const before = await fs.readFile(path.join(root, 'gold.draft.json'), 'utf8');
  await assert.rejects(() => applyBatch({ root, decision: decision({ draft_ids: [] }) }), /Partition/);
  assert.equal(await fs.readFile(path.join(root, 'gold.draft.json'), 'utf8'), before);
  await assert.rejects(() => fs.access(path.join(root, 'author')), /ENOENT/);
}));
test('concurrent change stops commit and retains recoverable intent and originals', async () => setup(async root => {
  await assert.rejects(() => applyBatch({ root, decision: decision(), beforeCommit: async () => {
    await fs.writeFile(path.join(root, 'gold.draft.json'), '[]\n');
  } }), /Concurrent change/);
  assert.deepEqual(await readJson(path.join(root, 'gold.json')), []);
  assert.deepEqual(await readJson(path.join(root, 'gold.draft.json')), []);
  const reviewDir = path.join(root, 'author', 'reviews', 'unit-batch');
  assert.equal((await readJson(path.join(reviewDir, 'gold.draft.before.json'))).length, 2);
  const journal = await readJson(path.join(reviewDir, 'progress.json'));
  assert.equal(journal.state, 'interrupted'); assert.deepEqual(journal.completed_files, []);
}));
