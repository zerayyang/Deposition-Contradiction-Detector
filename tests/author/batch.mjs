import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { atomicJson, digest, validateCases } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const hasApproval = c => c.human_review?.explicit_human_approval === true || c.human_review?.explicit_human_review === true;
function fail(message) { throw new Error(message); }
function ids(value, label) {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v) || new Set(value).size !== value.length) fail(`Invalid or duplicate ${label}`);
  return value;
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
export function planBatch({ drafts, gold, decision }) {
  validateCases(drafts, { statuses: ['draft', 'approved', 'rejected'], allowReview: true });
  validateCases(gold, { statuses: ['approved'], allowReview: true });
  for (const c of gold) if (!hasApproval(c)) fail(`Existing gold ${c.id} lacks explicit human approval provenance`);
  object(decision, 'decision');
  const allowed = ['batch_id', 'reviewed_by', 'approved_by', 'approval_date', 'approval_source', 'approved_ids', 'draft_ids', 'type_only_ids', 'case_updates', 'hold_reasons', 'ordinal_groups'];
  if (Object.keys(decision).some(k => !allowed.includes(k))) fail('Unexpected decision field');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(decision.batch_id ?? '')) fail('Invalid batch_id');
  if (decision.reviewed_by !== 'AI' || decision.approved_by !== 'zerayyang' || decision.approval_date !== '2026-10-14' || decision.approval_source !== 'explicit user batch instruction') fail('Explicit owner batch approval provenance is required');
  const approved = new Set(ids(decision.approved_ids, 'approved_ids'));
  const held = new Set(ids(decision.draft_ids, 'draft_ids'));
  const typeOnly = new Set(ids(decision.type_only_ids, 'type_only_ids'));
  const known = new Set(drafts.map(c => c.id));
  for (const id of approved) if (held.has(id)) fail(`Partition overlap ${id}`);
  for (const id of [...approved, ...held]) if (!known.has(id)) fail(`Unknown ID ${id}`);
  if (approved.size + held.size !== known.size) fail('Partition must cover all existing draft IDs exactly');
  for (const id of typeOnly) if (!approved.has(id)) fail(`TYPE_ONLY ID ${id} is not approved`);
  const updates = object(decision.case_updates ?? {}, 'case_updates');
  const reasons = object(decision.hold_reasons ?? {}, 'hold_reasons');
  const ordinals = object(decision.ordinal_groups ?? {}, 'ordinal_groups');
  for (const mapping of [updates, reasons, ordinals]) for (const id of Object.keys(mapping)) if (!known.has(id)) fail(`Unknown ID ${id}`);
  for (const [id, reason] of Object.entries(reasons)) if (!held.has(id) || typeof reason !== 'string' || !reason.trim()) fail(`Invalid hold reason ${id}`);
  const events = [];
  const nextDrafts = drafts.map(before => {
    const id = before.id, update = updates[id] ?? {};
    object(update, `update ${id}`);
    if (Object.keys(update).some(k => !['expected_evidence', 'code_support', 'review_policy'].includes(k))) fail(`Forbidden case update ${id}`);
    const scope = typeOnly.has(id) ? 'TYPE_ONLY' : 'TYPE_AND_EVIDENCE';
    const suppliedPolicy = update.review_policy ?? {};
    object(suppliedPolicy, `review_policy ${id}`);
    const policy = { ...before.review_policy, ...suppliedPolicy, band_assertion: 'informational', evidence_assertion: typeOnly.has(id) ? 'informational' : 'required', approval_scope: scope };
    for (const k of ['band_assertion', 'evidence_assertion', 'approval_scope']) if (suppliedPolicy[k] !== undefined && suppliedPolicy[k] !== policy[k]) fail(`Conflicting review policy ${id}`);
    delete policy.hold_reason;
    if (reasons[id]) policy.hold_reason = reasons[id];
    if (ordinals[id]) {
      object(ordinals[id], `ordinal group ${id}`);
      if (Object.keys(ordinals[id]).some(k => !['ordinal_pattern', 'ordinal_role'].includes(k))) fail(`Invalid ordinal group ${id}`);
      Object.assign(policy, ordinals[id]);
    }
    const after = { ...before, ...update, review_policy: policy, status: approved.has(id) ? 'approved' : 'draft' };
    delete after.human_review;
    const previousGold = gold.find(c => c.id === id);
    if (held.has(id) && previousGold) fail(`Cannot demote existing approved gold ${id}`);
    if (previousGold) for (const k of ['transcript1_text', 'transcript2_text', 'expected_type', 'expected_score_band', 'tricky_feature', 'rationale']) if (previousGold[k] !== before[k]) fail(`Existing gold differs for ${id}: ${k}`);
    if (approved.has(id)) {
      // Only this already explicitly reviewed source case retains human verification.
      const verified = id === 'sample-home' && previousGold?.human_review?.explicit_human_review === true;
      after.human_review = { reviewed_by: 'AI', approved_by: decision.approved_by, approval_date: decision.approval_date,
        explicit_human_approval: true, explicit_human_review: verified, human_verified: verified, approval_scope: scope,
        statement: `reviewed by AI, approved by ${decision.approved_by} on ${decision.approval_date}`,
        method: 'explicit-chat-batch', content_sha256: digest(after), decision: 'approve', batch_id: decision.batch_id };
    }
    events.push({ id, decision: approved.has(id) ? 'approve' : 'hold', previous_draft: before, previous_gold: previousGold ?? null, case: after });
    return after;
  });
  const nextGold = gold.map(c => nextDrafts.find(d => d.id === c.id && d.status === 'approved') ?? c);
  for (const c of nextDrafts) if (c.status === 'approved' && !nextGold.some(g => g.id === c.id)) nextGold.push(c);
  validateCases(nextDrafts, { statuses: ['draft', 'approved'], allowReview: true });
  validateCases(nextGold, { statuses: ['approved'], allowReview: true });
  return { batch_id: decision.batch_id, approved_count: approved.size, draft_count: held.size, next_gold: nextGold, next_drafts: nextDrafts, events };
}

export async function applyBatch({ root = path.join(here, '..'), decision, decisionPath, beforeCommit } = {}) {
  const decisionText = decisionPath ? await fs.readFile(decisionPath, 'utf8') : JSON.stringify(decision, null, 2) + '\n';
  if (decisionPath) {
    const fromFile = JSON.parse(decisionText);
    if (decision && JSON.stringify(decision) !== JSON.stringify(fromFile)) fail('Decision differs from decisionPath');
    decision = fromFile;
  }
  const goldPath = path.join(root, 'gold.json'), draftPath = path.join(root, 'gold.draft.json');
  const [goldText, draftText] = await Promise.all([fs.readFile(goldPath, 'utf8'), fs.readFile(draftPath, 'utf8')]);
  const plan = planBatch({ gold: JSON.parse(goldText), drafts: JSON.parse(draftText), decision });
  const reviewDir = path.join(root, 'author', 'reviews', decision.batch_id);
  await fs.mkdir(path.dirname(reviewDir), { recursive: true });
  await fs.mkdir(reviewDir); // Exclusive guard: a batch ID is never reused, including after partial completion.
  await fs.writeFile(path.join(reviewDir, 'gold.before.json'), goldText, { flag: 'wx' });
  await fs.writeFile(path.join(reviewDir, 'gold.draft.before.json'), draftText, { flag: 'wx' });
  await fs.writeFile(path.join(reviewDir, 'decision.json'), decisionText, { flag: 'wx' });
  await atomicJson(path.join(reviewDir, 'plan.json'), plan);
  const journal = { batch_id: decision.batch_id, state: 'intent', atomicity: 'per-file; inspect completed_files and snapshots to recover interrupted writes', before_sha256: { 'gold.json': hash(goldText), 'gold.draft.json': hash(draftText) }, completed_files: [] };
  const journalPath = path.join(reviewDir, 'progress.json');
  await atomicJson(journalPath, journal);
  let expectedGold = goldText, expectedDraft = draftText;
  async function checkUnchanged() {
    const [g, d] = await Promise.all([fs.readFile(goldPath, 'utf8'), fs.readFile(draftPath, 'utf8')]);
    if (g !== expectedGold || d !== expectedDraft || (decisionPath && await fs.readFile(decisionPath, 'utf8') !== decisionText)) fail('Concurrent change detected; inspect batch archive before retrying with a new batch ID');
  }
  try {
    if (beforeCommit) await beforeCommit({ reviewDir, plan });
    await checkUnchanged();
    await atomicJson(goldPath, plan.next_gold);
    expectedGold = JSON.stringify(plan.next_gold, null, 2) + '\n';
    journal.completed_files.push('gold.json'); await atomicJson(journalPath, journal);
    await checkUnchanged();
    await atomicJson(draftPath, plan.next_drafts);
    expectedDraft = JSON.stringify(plan.next_drafts, null, 2) + '\n';
    journal.completed_files.push('gold.draft.json'); await atomicJson(journalPath, journal);
    await checkUnchanged();
    journal.state = 'complete'; await atomicJson(journalPath, journal);
  } catch (error) {
    journal.state = 'interrupted'; journal.error = error.message;
    await atomicJson(journalPath, journal);
    throw error;
  }
  return { reviewDir, approvedCount: plan.approved_count, draftCount: plan.draft_count };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--decision') throw new Error('Usage: node tests/author/batch.mjs --decision path.json');
  console.log(JSON.stringify(await applyBatch({ decisionPath: path.resolve(args[1]) }), null, 2));
}
