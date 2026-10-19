import {summarizeConfidence} from '../../shared/hybridConfidence.js';

// Injected transport only. Nothing here creates clients, reads keys or starts paid calls.
// Callers must perform their own authentication, cost approval and source revalidation.
export async function reviewConfidence({finding, evidence, models, context, classify, review, calibration, signal}) {
  if (evidence?.sourcesVerified !== true) return summarizeConfidence({originalType: finding.type, evidence});
  if (!Array.isArray(models) || models.length !== 2 || new Set(models).size !== 2 ||
      models.some(m => typeof m !== 'string' || !m)) throw new Error('Two distinct qualified model identities are required.');
  const originalType = finding.type;
  const votes = [];
  // Context contains only the already-validated pair and its governing source context.
  // Independent requests see neither the original label nor each other's answers.
  for (const model of models) for (let permutation = 0; permutation < 3; permutation++) {
    signal?.throwIfAborted();
    try {
      const answer = await classify({model, permutation, context: structuredClone(context), signal});
      votes.push({model, permutation, status: 'SUCCESS', type: answer.type});
    } catch {
      signal?.throwIfAborted();
      votes.push({model, permutation, status: 'FAILED'});
    }
  }
  signal?.throwIfAborted();
  let reviewer;
  try {
    const answer = await review({context: structuredClone(context), signal});
    reviewer = {status: 'SUCCESS', type: answer.type, objections: answer.objections};
  } catch {
    signal?.throwIfAborted();
    reviewer = {status: 'FAILED'};
  }
  return {...summarizeConfidence({originalType, votes, reviewer, evidence, calibration}), votes, reviewer};
}
