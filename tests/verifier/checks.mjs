import { isDeepStrictEqual } from 'node:util';
import { assessCandidate } from '../../server/humanConfidencePipeline.js';

export const types = ['DIRECT', 'INFERENTIAL', 'FALSE_POSITIVE'];
export const evidence = { CONFLICT_SUPPORTED: 'CONFLICT', COMPATIBLE_SUPPORTED: 'COMPATIBLE', NOT_EVALUABLE: 'NOT_EVALUABLE' };
export const bands = ['STRONG', 'MODERATE', 'LIMITED', 'WEAK'];
const phrases = ['activityPhrase', 'timePhrase', 'locationPhrase', 'personPhrase', 'objectPhrase', 'quantityPhrase', 'statePhrase'];
export function validateGold(rows) {
  const errors = [], rejected = [], approved = [], ids = new Set();
  if (!Array.isArray(rows)) return { errors: ['Gold must be an array'], rejected, approved };
  if (!rows.length) errors.push('EMPTY_GOLD_FAIL: gold contains no cases');
  rows.forEach((r, i) => {
    const at = `row ${i + 1} (${r?.id ?? 'missing id'})`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`${at}: invalid row`); return; }
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.id)) errors.push(`${at}: invalid ID`);
    if (ids.has(r.id)) errors.push(`${at}: duplicate ID`);
    ids.add(r.id);
    for (const key of ['transcript1_text', 'transcript2_text', 'tricky_feature', 'rationale']) if (typeof r[key] !== 'string' || !r[key].trim()) errors.push(`${at}: invalid ${key}`);
    if (!types.includes(r.expected_type)) errors.push(`${at}: invalid expected_type`);
    if (!Object.values(evidence).includes(r.expected_evidence) && !(r.expected_evidence === 'depends on implemented rules' && r.review_policy?.approval_scope === 'TYPE_ONLY' && r.review_policy?.evidence_assertion === 'informational')) errors.push(`${at}: invalid expected_evidence`);
    if (!(bands.includes(r.expected_score_band) || r.expected_score_band === null)) errors.push(`${at}: invalid expected_score_band`);
    if (r.review_policy?.evidence_assertion !== 'informational' && (r.expected_evidence === 'NOT_EVALUABLE') !== (r.expected_score_band === null)) errors.push(`${at}: null band is exclusive to NOT_EVALUABLE`);
    if (r.review_policy !== undefined) {
      const p = r.review_policy;
      if (!p || typeof p !== 'object' || Array.isArray(p) || p.band_assertion !== 'informational' || !['required', 'informational'].includes(p.evidence_assertion)) errors.push(`${at}: invalid review_policy`);
      if (p?.evidence_assertion === 'informational' && r.review_policy?.approval_scope !== 'TYPE_ONLY') errors.push(`${at}: informational evidence requires TYPE_ONLY approval_scope`);
      if (p?.ordinal_pattern !== undefined && p.ordinal_pattern !== 'time') errors.push(`${at}: invalid ordinal_pattern`);
      if (p?.ordinal_role !== undefined && !['EXACT_DIRECT','APPROXIMATE_INFERENTIAL'].includes(p.ordinal_role)) errors.push(`${at}: invalid ordinal_role`);
      if ((p?.ordinal_pattern !== undefined) !== (p?.ordinal_role !== undefined)) errors.push(`${at}: ordinal_pattern and ordinal_role must occur together`);
    }
    if (r.code_support !== undefined && (!r.code_support || typeof r.code_support !== 'object' || Array.isArray(r.code_support))) errors.push(`${at}: invalid code_support`);
    if (r.target_claims !== undefined) {
      for (const [key,input] of [['claim1',r.transcript1_text],['claim2',r.transcript2_text]]) {
        const quote=r.target_claims?.[key];
        if(typeof quote!=='string'||!quote.trim()||typeof input!=='string'||!input.includes(quote)) errors.push(`${at}: target_claims.${key} must be an exact input quote`);
      }
    }
    if(r.judicial_relation!==undefined&&!['supports','context_only','disagrees'].includes(r.judicial_relation)) errors.push(`${at}: invalid judicial_relation`);
    if(r.conflict_basis!==undefined&&!['judicial_reference','not_determinable_from_input'].includes(r.conflict_basis)) errors.push(`${at}: invalid conflict_basis`);
    if(r.type_basis!==undefined&&r.type_basis!=='project_rule') errors.push(`${at}: invalid type_basis`);
    if(r.judicial_expected_evidence!==undefined&&!Object.values(evidence).includes(r.judicial_expected_evidence)) errors.push(`${at}: invalid judicial_expected_evidence`);
    if(r.verification_policy!==undefined&&(typeof r.verification_policy?.exclude!=='boolean'||typeof r.verification_policy?.reason!=='string')) errors.push(`${at}: invalid verification_policy`);
    if(r.superseded_by || r.verification_policy?.exclude===true || r.review_status==='judge-disputed') rejected.push({id:r.id,status:r.status,reason:r.superseded_by?`Superseded by ${r.superseded_by}; not executed`:r.verification_policy?.reason||'Judge-disputed; excluded from pass/fail'});
    else if (r.status !== 'approved') rejected.push({ id: r.id, status: r.status ?? null, reason: 'Not approved; not executed' });
    else approved.push(r);
  });
  return { errors, rejected, approved };
}

// These checks never repair, coerce, or select candidates to match a label.
export function checkCandidate(c, row) {
  const errors = [], informational = [];
  const evidenceChecked = row.review_policy?.evidence_assertion !== 'informational';
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { errors: ['Candidate must be an object'], informational, typeMatch: false, evidenceMatch: false, evidenceChecked, bandMatch: false, labelMatch: false };
  if (!types.includes(c.type)) errors.push('Invalid type');
  if (typeof c.severity !== 'string' || !c.severity) errors.push('Missing/invalid severity');
  if (typeof c.reasoning !== 'string' || !c.reasoning) errors.push('Missing/invalid reasoning');
  for (const [key, input] of [['claim1', row.transcript1_text], ['claim2', row.transcript2_text]]) {
    const claim = c[key];
    const original = typeof claim?.original === 'string' ? claim.original : '';
    if (!claim || typeof claim.original !== 'string' || !claim.original.trim() || !input.includes(claim.original)) errors.push(`${key}.original is not a nonempty verbatim input quote`);
    for (const field of phrases) {
      const value = claim?.[field];
      if (value !== null && (typeof value !== 'string' || !value || !original.includes(value) || !input.includes(value))) errors.push(`${key}.${field}: missing/invalid literal extraction`);
    }
    if (!Array.isArray(claim?.qualifierPhrases)) errors.push(`${key}.qualifierPhrases must be an array`);
    else for (const q of claim.qualifierPhrases) if (typeof q !== 'string' || !q || !original.includes(q) || !input.includes(q)) errors.push(`${key}: invalid literal qualifier`);
  }
  if (!(Object.hasOwn(evidence, c.status))) errors.push('Invalid/missing evidence status');
  if (!(bands.includes(c.band) || c.band === 'NOT_EVALUABLE')) errors.push('Invalid/missing band');
  if (c.status === 'NOT_EVALUABLE' ? c.score !== null || c.band !== 'NOT_EVALUABLE' : typeof c.score !== 'number' || !Number.isFinite(c.score) || c.score < 0 || c.score > 100 || c.band === 'NOT_EVALUABLE') errors.push('Score/status/band consistency failure');
  for (const key of ['score', 'humanConfidence', 'evidenceStrength', 'evidenceScore', 'commitment', 'rulesFired', 'rulesLimiting', 'languageDetails', 'configVersion', 'notEvaluableReason']) if (!Object.hasOwn(c, key)) errors.push(`Missing ${key}`);
  if (!Array.isArray(c.rulesFired) || !Array.isArray(c.rulesLimiting)) errors.push('Invalid rule arrays');
  if (!c.commitment || !['claim1', 'claim2', 'pair'].every(k => typeof c.commitment[k] === 'number' && Number.isFinite(c.commitment[k]))) errors.push('Invalid commitment');
  try {
    const replay = assessCandidate(c, row.transcript1_text, row.transcript2_text);
    for (const key of ['score', 'humanConfidence', 'evidenceStrength', 'evidenceScore', 'status', 'band', 'commitment', 'rulesFired', 'rulesLimiting', 'languageDetails', 'configVersion', 'notEvaluableReason']) if (!isDeepStrictEqual(c[key], replay[key])) errors.push(`Deterministic provenance mismatch: ${key}`);
    if (!replay.claim1Valid || !replay.claim2Valid) errors.push('Server literal witness grounding failed');
  } catch (e) { errors.push(`Cannot replay candidate: ${e.message}`); }
  const typeMatch = c.type === row.expected_type;
  const evidenceMatch = evidence[c.status] === row.expected_evidence;
  const bandMatch = c.band === (row.expected_score_band ?? 'NOT_EVALUABLE');
  if ((row.expected_type === 'FALSE_POSITIVE' || c.type === 'FALSE_POSITIVE') && c.status === 'CONFLICT_SUPPORTED' && typeof c.score === 'number' && c.score > 0) errors.push('FALSE_POSITIVE cannot have supported positive conflict score');
  if (!typeMatch) errors.push('Expected/actual type mismatch');
  if (!evidenceMatch) (evidenceChecked ? errors : informational).push('Expected/actual evidence mismatch' + (evidenceChecked ? '' : ' (TYPE_ONLY informational)'));
  if (!bandMatch) informational.push('Provisional expected/actual band mismatch');
  const labelMatch = typeMatch && (!evidenceChecked || evidenceMatch);
  return { errors, informational, typeMatch, evidenceMatch, evidenceChecked, bandMatch, labelMatch };
}

export const isLabelError = error => /^(?:candidate \d+: )?Expected\/actual (?:type|evidence) mismatch$/.test(error);
export const validAttempt = run => run.httpStatus >= 200 && run.httpStatus < 300 && run.candidates.length === 1 && run.errors.every(isLabelError);

// Metadata only selects comparisons; it never relaxes deterministic provenance checks.
export function checkOrdinal(cases) {
  const comparisons = [], skipped = [];
  const patterns = [...new Set(cases.map(c => c.row.review_policy?.ordinal_pattern).filter(Boolean))];
  if (!patterns.length) skipped.push({ reason: 'No matched approved cases with ordinal metadata' });
  for (const pattern of patterns) {
    const exact = cases.filter(c => c.row.review_policy?.ordinal_pattern === pattern && c.row.review_policy?.ordinal_role === 'EXACT_DIRECT');
    const approximate = cases.filter(c => c.row.review_policy?.ordinal_pattern === pattern && c.row.review_policy?.ordinal_role === 'APPROXIMATE_INFERENTIAL');
    if (!exact.length || !approximate.length) { skipped.push({ pattern, reason: 'No matched approved exact/approximate cases' }); continue; }
    for (const a of exact) for (const b of approximate) {
      const scores = c => c.runs.filter(validAttempt).map(r => ({ run: r.run, candidate: r.candidates[0].candidate })).filter(({candidate:c}) => c.status === 'CONFLICT_SUPPORTED' && Number.isFinite(c.score) && c.rulesFired?.some(r => r.id === pattern && r.verdict === 'CONFLICT'));
      const aa = scores(a), bb = scores(b);
      if (aa.length !== a.runs.length || bb.length !== b.runs.length || !aa.length || !bb.length) { skipped.push({ pattern, exactId:a.row.id, approximateId:b.row.id, reason:'Unscored/invalid output or missing shared fired CONFLICT rule' }); }
      if (!aa.length || !bb.length) continue;
      for (const x of aa) for (const y of bb) {
        const pass = x.candidate.score >= y.candidate.score;
        const comparison = { pattern, exactId:a.row.id, approximateId:b.row.id, exactRun:x.run, approximateRun:y.run, exactScore:x.candidate.score, approximateScore:y.candidate.score, pass };
        comparisons.push(comparison);
        if (!pass) for (const c of [a,b]) { c.ordinalErrors ??= []; c.ordinalErrors.push(`Ordinal ${pattern}: ${a.row.id} run ${x.run} score ${x.candidate.score} < ${b.row.id} run ${y.run} score ${y.candidate.score}`); c.pass = false; }
      }
    }
  }
  const failed = comparisons.filter(c => !c.pass).length;
  return { status: failed ? 'FAIL' : comparisons.length ? 'PASS' : 'SKIPPED', pass: comparisons.length ? failed === 0 : null, passed:comparisons.length-failed, failed, skipped:skipped.length, comparisons, skips:skipped };
}

// Keep the stored exact source quote. The literal leading answer marker A. / A:
// is formatting, not witness words; every remaining character must match exactly.
const witnessQuote = quote => typeof quote==='string'?quote.replace(/^A[.:] /u,''):quote;
export function matchesTarget(candidate, targets) {
  return ['claim1','claim2'].every(key=>typeof candidate?.[key]?.original==='string' && witnessQuote(candidate[key].original).includes(witnessQuote(targets[key])));
}
export function checkResponse(body, row) {
  const errors = [];
  if (!body || !Array.isArray(body.topicsReviewed) || !Array.isArray(body.contradictions)) return { errors: ['Invalid API response schema'], candidates: [], extraFindings: [], pass: false };
  const scoped=Boolean(row.target_claims);
  const selected=body.contradictions.map((candidate,index)=>({candidate,index}));
  const targets=scoped?selected.filter(({candidate})=>matchesTarget(candidate,row.target_claims)):selected;
  const extraFindings=scoped?selected.filter(({candidate})=>!matchesTarget(candidate,row.target_claims)):[];
  if (!targets.length) errors.push(scoped?'NO_TARGET_PAIR_FAIL: no finding matches both exact target quotes':'NO_PAIR_FAIL: empty contradictions array. The app may intentionally omit compatible findings; this one-pair verifier contract still requires a returned pair.');
  if (targets.length > 1) errors.push(scoped?`DUPLICATE_TARGET_PAIRS_FAIL: expected one target candidate, received ${targets.length}`:`EXTRA_PAIRS_FAIL: expected one candidate, received ${targets.length}`);
  const candidates = targets.map(({candidate,index}) => ({ index, candidate, ...checkCandidate(candidate, row) }));
  errors.push(...candidates.flatMap(c => c.errors.map(e => `candidate ${c.index + 1}: ${e}`)));
  const judicialAgreement=row.judicial_expected_evidence===undefined?null:{informational:true,referenceEvidence:row.judicial_expected_evidence,relation:row.judicial_relation,basis:row.conflict_basis,actualEvidence:targets.length===1?evidence[targets[0].candidate?.status]??null:null,agrees:targets.length===1?evidence[targets[0].candidate?.status]===row.judicial_expected_evidence:null};
  const informational=candidates.flatMap(c => c.informational.map(e => `candidate ${c.index + 1}: ${e}`));
  if(extraFindings.length) informational.push(`${extraFindings.length} extra findings outside target_claims (not failures)`);
  return { errors, informational, candidates, extraFindings, judicialAgreement, pass: errors.length === 0 };
}
