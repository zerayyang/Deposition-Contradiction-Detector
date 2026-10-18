// Decision-based human-confidence score (preview layer, off by default).
// The AI's checked answers say WHAT KIND of clash it is; the owner's word lists say HOW
// FIRMLY the witness said each statement. The formula is the live engine's:
//   score = 100 x evidence x (0.5 + 0.5 x commitment), compatible pairs capped at 15.
// It is reported next to the live score and replaces nothing until the owner switches it on.
import {commitmentOf} from './detectors.js';

// Evidence strength per clash form. Code-checked values (valueCheck) override the form.
export const EVIDENCE=Object.freeze({AFFIRM_VS_DENY:0.95,EXHAUSTIVE_VS_EXCEPTION:0.85,DIFFERENT_EXACT_VALUES:0.9,
  NON_OVERLAPPING_APPROXIMATIONS:0.7,REQUIRES_INFERENCE:0.6,NONE:0.5});
export const MISSING_FACT_FACTOR=0.8; // A stated missing fact lowers evidence; the type is unchanged.
export const COMPATIBLE_CAP=15;

export function decisionConfidence(finding){
  const decision=finding?.decision;
  if(!decision)return null;
  const claim1=commitmentOf(finding.claim1?.original),claim2=commitmentOf(finding.claim2?.original),commitment=Math.min(claim1,claim2);
  const commitments={claim1,claim2,pair:commitment};
  const basis=[];
  if(finding.type==='FALSE_POSITIVE'){
    basis.push(finding.typeRule??'Compatible statements.');
    return {score:Math.round(COMPATIBLE_CAP*commitment),status:'COMPATIBLE',evidence:0,commitment,commitments,basis};
  }
  let evidence=finding.valueCheck?(finding.valueCheck.exact?1:0.7):(EVIDENCE[decision.conflictForm]??EVIDENCE.NONE);
  basis.push(finding.valueCheck?`Code compared the ${finding.valueCheck.kind}s.`:`Clash form: ${String(decision.conflictForm).toLowerCase().replaceAll('_',' ')} (${evidence}).`);
  if(finding.reviewNote){evidence=Math.round(evidence*MISSING_FACT_FACTOR*100)/100;basis.push(`Missing fact lowers evidence: ${finding.reviewNote}`);}
  basis.push(`Commitment ${commitment.toFixed(2)} from the witness's own wording.`);
  return {score:Math.round(100*evidence*(0.5+0.5*commitment)),status:'CONFLICT',evidence,commitment,commitments,basis};
}
