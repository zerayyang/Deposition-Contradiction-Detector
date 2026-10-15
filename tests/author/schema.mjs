import { validateSourceRefs } from './level2-provenance.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const TYPES = ['DIRECT', 'INFERENTIAL', 'FALSE_POSITIVE'];
export const EVIDENCE = ['CONFLICT', 'COMPATIBLE', 'NOT_EVALUABLE'];
export const BANDS = ['STRONG', 'MODERATE', 'LIMITED', 'WEAK', null];
export const COVERAGE_TAGS = ['affirm_deny', 'exact_values', 'approx_clock_overlap', 'approx_clock_nonoverlap', 'assertion_hedge_direct', 'unrelated_hedge_ignored', 'value_approx_inferential', 'negation', 'home_at_home', 'awareness', 'misc_vague', 'compatible'];
export function selectTemperature(model, explicitProviderDefault = false) {
  const knownDeprecated = model === 'claude-opus-5-5';
  const omit = knownDeprecated || explicitProviderDefault;
  return {
    temperatureMode: explicitProviderDefault ? 'provider-default-explicit' : knownDeprecated ? 'known-deprecated-provider-default' : 'explicit-zero',
    temperatureRequested: omit ? null : 0,
    modelCapability: { model, temperature: knownDeprecated ? 'known-deprecated' : 'unverified',
      evidence: knownDeprecated ? 'Observed provider HTTP 400: `temperature` is deprecated for this model.' : 'No model-specific temperature capability observation recorded.' },
    reason: knownDeprecated ? 'Known provider rejection observed before this call: `temperature` is deprecated for this model.'
      : explicitProviderDefault ? 'Explicit --provider-default-temperature opt-in for this model.' : 'Request temperature: 0 where no deprecation is known.',
    parameters: omit ? {} : { temperature: 0 }
  };
}
export function extractResponseText(result) {
  if (result.stop_reason !== 'end_turn') throw new Error(`Incomplete or unexpected stop_reason ${result.stop_reason}`);
  if (!Array.isArray(result.content) || !result.content.length) throw new Error('Expected response content blocks');
  const allowed = ['text', 'thinking', 'redacted_thinking'];
  for (const block of result.content) {
    if (!allowed.includes(block.type)) throw new Error(`Unexpected response block type ${block.type}`);
    if (block.type === 'text' && typeof block.text !== 'string') throw new Error('Text response block must contain a string');
  }
  const texts = result.content.filter(b => b.type === 'text');
  if (!texts.length) throw new Error('Expected at least one text response block');
  return texts.map(b => b.text).join('');
}
export const REVIEW_FIELDS = ['target_claims','judicial_relation','conflict_basis','type_basis','judicial_expected_evidence','verification_policy','superseded_by'];
export const FIELDS = ['id', 'transcript1_text', 'transcript2_text', 'expected_type', 'expected_evidence', 'expected_score_band', 'tricky_feature', 'rationale', 'status'];
export function validateCase(c, { statuses = ['draft'], allowReview = false } = {}) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Each case must be an object');
  for (const k of FIELDS) if (!Object.hasOwn(c, k)) throw new Error(`Missing ${k}`);
  for (const k of Object.keys(c)) if (!FIELDS.includes(k) && !(allowReview && ['human_review', 'review_policy', 'code_support', 'source_refs', ...REVIEW_FIELDS].includes(k))) throw new Error(`Unexpected field ${k}`);
  for (const k of ['id', 'transcript1_text', 'transcript2_text', 'tricky_feature', 'rationale']) if (typeof c[k] !== 'string' || !c[k].trim()) throw new Error(`${k} must be nonempty text`);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(c.id)) throw new Error('id must contain only letters, numbers, underscores, and hyphens');
  if (!TYPES.includes(c.expected_type)) throw new Error('Invalid expected_type');
  if (allowReview) validateReviewMetadata(c);
  if (c.source_refs !== undefined) validateSourceRefs(c.source_refs,c);
  const informational = allowReview && c.review_policy?.approval_scope === 'TYPE_ONLY' && c.review_policy?.evidence_assertion === 'informational';
  if (!EVIDENCE.includes(c.expected_evidence) && !(informational && c.expected_evidence === 'depends on implemented rules')) throw new Error('Invalid expected_evidence');
  if (!BANDS.includes(c.expected_score_band)) throw new Error('Invalid expected_score_band');
  if (!informational && (c.expected_score_band === null) !== (c.expected_evidence === 'NOT_EVALUABLE')) throw new Error('expected_score_band must be null exactly when expected_evidence is NOT_EVALUABLE');
  if (!statuses.includes(c.status)) throw new Error(`Invalid status ${c.status}`);
  if (/[\r\n]/.test(c.rationale)) throw new Error('rationale must be a single sentence on one line');
  return c;
}
export function validateCases(cases, options = {}) {
  if (!Array.isArray(cases)) throw new Error('Expected a JSON array');
  const ids = new Set();
  for (const c of cases) { validateCase(c, options); if (ids.has(c.id)) throw new Error(`Duplicate ID ${c.id}`); ids.add(c.id); }
  return cases;
}
export function validateGenerated(cases, seeds) {
  validateCases(cases);
  if (cases.length < 25) throw new Error('At least 25 cases are required');
  if (cases.filter(c => c.expected_type === 'FALSE_POSITIVE').length < 5) throw new Error('At least five FALSE_POSITIVE cases are required');
  for (const s of seeds) {
    const c = cases.find(c => c.id === s.id);
    if (!c || c.transcript1_text !== s.transcript1_text || c.transcript2_text !== s.transcript2_text) throw new Error(`Missing or changed source seed ${s.id}`);
  }
  for (const tag of COVERAGE_TAGS) {
    if (!cases.some(c => c.tricky_feature.includes(`[${tag}]`))) throw new Error(`Missing mandatory coverage tag [${tag}] in tricky_feature`);
  }
  return cases;
}
export function validateReviewMetadata(c) {
  const object = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} must be an object`); };
  const scopes = ['TYPE_ONLY', 'TYPE_AND_EVIDENCE'];
  if (REVIEW_FIELDS.some(k => Object.hasOwn(c,k))) {
    const t=c.target_claims; object(t,'target_claims');
    if(Object.keys(t).sort().join(',')!=='claim1,claim2'||!['claim1','claim2'].every((k,i)=>typeof t[k]==='string'&&t[k].trim()&&c[`transcript${i+1}_text`].includes(t[k]))) throw new Error('Target claims must be exact corresponding input substrings');
    if(!['supports','context_only','disagrees'].includes(c.judicial_relation)||!['judicial_reference','not_determinable_from_input'].includes(c.conflict_basis)||c.type_basis!=='project_rule'||!EVIDENCE.includes(c.judicial_expected_evidence)) throw new Error('Invalid judicial assessment');
    const v=c.verification_policy; object(v,'verification_policy');
    if(Object.keys(v).some(k=>!['exclude','reason'].includes(k))||typeof v.exclude!=='boolean'||typeof v.reason!=='string'||!v.reason.trim()) throw new Error('Invalid verification_policy');
    if(c.superseded_by!==undefined&&(typeof c.superseded_by!=='string'||!c.superseded_by.trim()||!v.exclude)) throw new Error('Invalid superseded_by');
  }
  if (c.review_policy !== undefined) {
    const p = c.review_policy; object(p, 'review_policy');
    const keys = ['band_assertion', 'evidence_assertion', 'approval_scope', 'ordinal_pattern', 'ordinal_role', 'hold_reason'];
    if (Object.keys(p).some(k => !keys.includes(k))) throw new Error('Unexpected review_policy field');
    if (p.band_assertion !== 'informational' || !scopes.includes(p.approval_scope) || !['required', 'informational'].includes(p.evidence_assertion)) throw new Error('Invalid review_policy');
    if ((p.approval_scope === 'TYPE_ONLY') !== (p.evidence_assertion === 'informational')) throw new Error('Evidence assertion must match approval scope');
    if (p.ordinal_pattern !== undefined && p.ordinal_pattern !== 'time') throw new Error('Invalid ordinal_pattern');
    if (p.ordinal_role !== undefined && !['EXACT_DIRECT', 'APPROXIMATE_INFERENTIAL'].includes(p.ordinal_role)) throw new Error('Invalid ordinal_role');
    if ((p.ordinal_pattern === undefined) !== (p.ordinal_role === undefined)) throw new Error('Ordinal pattern and role must occur together');
    if (p.hold_reason !== undefined && (typeof p.hold_reason !== 'string' || !p.hold_reason.trim())) throw new Error('Invalid hold_reason');
  }
  if (c.code_support !== undefined) object(c.code_support, 'code_support');
  if (c.human_review !== undefined) {
    const r = c.human_review; object(r, 'human_review');
    for (const k of ['explicit_human_approval', 'explicit_human_review', 'human_verified']) if (r[k] !== undefined && typeof r[k] !== 'boolean') throw new Error(`Invalid ${k}`);
    if (r.approval_scope !== undefined && (!scopes.includes(r.approval_scope) || r.approval_scope !== c.review_policy?.approval_scope)) throw new Error('Invalid review approval_scope');
    if (r.human_verified === true && r.explicit_human_review !== true) throw new Error('human_verified requires explicit human review');
    if (r.method === 'explicit-chat-batch') {
      if ((r.human_verified === true || r.explicit_human_review === true) && c.id !== 'sample-home') throw new Error('Only the previously human-reviewed sample-home may retain human verification in this batch');
      if (r.human_verified !== r.explicit_human_review) throw new Error('Batch human verification must match explicit human review');
      if (r.reviewed_by !== 'AI' || r.approved_by !== 'zerayyang' || !/^\d{4}-\d{2}-\d{2}$/.test(r.approval_date ?? '') || r.explicit_human_approval !== true || typeof r.explicit_human_review !== 'boolean' || typeof r.human_verified !== 'boolean' || !scopes.includes(r.approval_scope) || r.decision !== 'approve') throw new Error('Invalid batch approval provenance');
      if (r.statement !== `reviewed by AI, approved by ${r.approved_by} on ${r.approval_date}`) throw new Error('Invalid batch approval statement');
      if (r.content_sha256 !== digest(c)) throw new Error('Batch approval content hash mismatch');
    }
  }
}
export const contentOf = c => Object.fromEntries([...FIELDS.filter(k => k !== 'status'), ...['review_policy', 'code_support', 'source_refs', ...REVIEW_FIELDS].filter(k => Object.hasOwn(c, k))].map(k => [k, c[k]]));
export const sameContent = (a, b) => JSON.stringify(contentOf(a)) === JSON.stringify(contentOf(b));
export const digest = c => crypto.createHash('sha256').update(JSON.stringify(contentOf(c))).digest('hex');
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function exists(file) { try { await fs.access(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function atomicJson(file, value) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  // Leave a complete temp file in place if rename fails; never delete the prior target on failure.
  await fs.rename(temp, file);
}
export async function archiveDraft(file, archiveDir) {
  await fs.mkdir(archiveDir, { recursive: true });
  const archived = path.join(archiveDir, `gold.draft.${new Date().toISOString().replaceAll(':', '-')}.${crypto.randomUUID()}.json`);
  await fs.copyFile(file, archived, 1);
  return archived;
}
