// Classification reliability is separate from evidence strength and witness truthfulness.
export const HYBRID_VERSION = 'hybrid-confidence-v1';
export const CONFIDENCE_LABELS = ['DIRECT', 'INFERENTIAL', 'FALSE_POSITIVE'];
export const FEATURE_NAMES = ['agreement', 'reviewerAgrees', 'reviewerObjects', 'ruleSupported', 'ruleStrength'];

export function summarizeConfidence({originalType, votes = [], reviewer, evidence, calibration} = {}) {
  const base = {version: HYBRID_VERSION, originalType, score: null, logprobs: 'UNAVAILABLE', expectedVotes: 6};
  if (!CONFIDENCE_LABELS.includes(originalType)) return {...base, status: 'REVIEW_REQUIRED'};
  if (evidence?.sourcesVerified !== true) return {...base, status: 'SOURCE_REVIEW_REQUIRED'};
  // Two model identities, three fixed permutations each. Duplicates are not extra votes.
  const valid = votes.filter(v => v.status === 'SUCCESS' && CONFIDENCE_LABELS.includes(v.type));
  const slots = new Set(valid.map(v => `${v.model}:${v.permutation}`));
  const models = new Set(valid.map(v => v.model));
  const complete = votes.length === 6 && valid.length === 6 && slots.size === 6 && models.size === 2 &&
    [...models].every(m => valid.filter(v => v.model === m).length === 3) &&
    valid.every(v => typeof v.model === 'string' && v.model.length > 0 && [0, 1, 2].includes(v.permutation));
  const agreeing = valid.filter(v => v.type === originalType).length;
  const result = {...base, receivedVotes: valid.length, agreeingVotes: agreeing,
    agreement: valid.length ? agreeing / valid.length : null};
  if (!complete || reviewer?.status !== 'SUCCESS' || !CONFIDENCE_LABELS.includes(reviewer.type) ||
      !Array.isArray(reviewer.objections) || reviewer.objections.some(v => typeof v !== 'string')) {
    return {...result, status: 'INCOMPLETE'};
  }
  const features = [agreeing / 6, Number(reviewer.type === originalType), Number(reviewer.objections.length > 0),
    Number(evidence.ruleSupported === true), Number.isFinite(evidence.ruleStrength) ? evidence.ruleStrength : 0];
  if (features[4] < 0 || features[4] > 1) return {...result, status: 'INVALID_EVIDENCE'};
  const signals = {...result, features: Object.fromEntries(FEATURE_NAMES.map((k, i) => [k, features[i]])),
    reviewerAgrees: reviewer.type === originalType, objections: [...reviewer.objections]};
  // No built-in weights: an untrained system cannot claim calibrated accuracy.
  if (!calibration) return {...signals, status: 'UNCALIBRATED'};
  if (calibration.version !== HYBRID_VERSION || calibration.target !== 'ORIGINAL_TYPE_CORRECT' ||
      !calibration.datasetId || calibration.featureNames?.join('|') !== FEATURE_NAMES.join('|') ||
      !Array.isArray(calibration.weights) || calibration.weights.length !== FEATURE_NAMES.length ||
      !calibration.weights.every(Number.isFinite) || !Number.isFinite(calibration.intercept)) {
    return {...signals, status: 'INVALID_CALIBRATION'};
  }
  const z = calibration.intercept + features.reduce((s, v, i) => s + v * calibration.weights[i], 0);
  return {...signals, status: 'CALIBRATED', score: Math.round(100 / (1 + Math.exp(-z))),
    calibrationId: calibration.datasetId};
}

export function hybridBadge(result) {
  const c = result?.hybridConfidence;
  if (c?.status === 'CALIBRATED' && c.version === HYBRID_VERSION &&
      c.originalType === result.type && Number.isFinite(c.score) && c.score >= 0 && c.score <= 100 &&
      !result.labelDisagreement) return {kind: 'conflict', value: `${c.score}%`, text: 'Classification confidence'};
  if(c?.status==='UNCALIBRATED'&&c.originalType===result.type&&!result.labelDisagreement) return {kind:'agreement',value:`${c.agreeingVotes}/6`,text:'AI agreement · not calibrated accuracy'};
  return {kind: 'none', value: '—', text: 'Confidence not checked'};
}
