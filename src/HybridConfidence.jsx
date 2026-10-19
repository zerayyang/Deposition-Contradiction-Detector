import {hybridBadge} from '../shared/hybridConfidence.js';

const states={PENDING:'Checking soon',INCOMPLETE:'Checks incomplete',CANCELLED:'Checks stopped',BUDGET_LIMIT:'Not checked · allowance reached',SOURCE_REVIEW_REQUIRED:'Source needs review',REVIEW_REQUIRED:'Needs your review'};
export default function HybridConfidence({result}) {
  const c=result.hybridConfidence;
  const valid=c?.originalType===result.type&&!result.labelDisagreement;
  const done=valid&&['CALIBRATED','UNCALIBRATED'].includes(c?.status);
  const votes=done?`${c.agreeingVotes} of ${c.expectedVotes??6}`:null;
  const calibrated=valid&&c?.status==='CALIBRATED';
  return <section className="confidence-summary" aria-label="Confidence review">
    <div className="confidence-summary-top"><div><span className="eyebrow">{calibrated?'Classification confidence':'AI agreement'}</span>
      <h3>{calibrated?hybridBadge(result).value:done?votes:states[c?.status]??'Not checked'}</h3></div>
      {done&&<span className="confidence-state">{c.reviewerAgrees?'Checker agrees':'Review suggested'}</span>}
    </div>
    <p>{done?'AI reads agree with the original category. Agreement is not measured accuracy.':'Confidence is included automatically in a new review. Your saved finding is still available.'}</p>
    {valid&&c?.objections?.length>0&&<p className="confidence-concern">{c.objections.join(' ')}</p>}
    <details><summary>How this works</summary><p>Two models each check the same finding three ways. A separate AI checker sees the original words, without seeing the votes. Source checks cannot be outvoted. Failed checks are never counted as agreeing votes.</p><p>Human-approved examples are needed to turn these signals into a calibrated percentage. That step is not ready yet.</p>
      {Number.isFinite(c?.spentUsd)&&<p>Usage estimate for this finding: US ${c.spentUsd.toFixed(4)}. Not verified billing.</p>}
    </details>
  </section>;
}
