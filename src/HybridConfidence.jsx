import {hybridBadge} from '../shared/hybridConfidence.js';
import {reviewerPoints} from './lib/reviewerPoints.js';

const states={PENDING:'Checking soon',INCOMPLETE:'Checks incomplete',CANCELLED:'Checks stopped',BUDGET_LIMIT:'Not checked · allowance reached',SOURCE_REVIEW_REQUIRED:'Source needs review',REVIEW_REQUIRED:'Needs your review'};
export default function HybridConfidence({result}) {
  const c=result.hybridConfidence;
  const valid=c?.originalType===result.type&&!result.labelDisagreement;
  const done=valid&&['CALIBRATED','UNCALIBRATED','EXPERIMENTAL'].includes(c?.status);
  const votes=done?`${c.agreeingVotes} of ${c.expectedVotes??6}`:null;
  const calibrated=valid&&c?.status==='CALIBRATED';
  const agreement=done&&Number.isInteger(c.agreeingVotes)&&c.agreeingVotes>=0&&c.agreeingVotes<=6?Math.round(c.agreeingVotes/6*100):null;
  const combined=valid&&['CALIBRATED','EXPERIMENTAL'].includes(c?.status);
  const calibratedValue=combined?Number.parseInt(hybridBadge(result).value,10):null;
  const percentage=combined?Number.isFinite(calibratedValue)?calibratedValue:null:agreement;
  const title=calibrated?'Classification confidence':c?.status==='EXPERIMENTAL'?'Hybrid score':'AI agreement';
  return <section className="confidence-summary" aria-label="Confidence review">
    <div className="confidence-summary-top"><div className="confidence-ring-layout">
      <div className={`confidence-ring ${percentage===null?'is-pending':''}`} role="img" aria-label={percentage===null?`${title}: ${states[c?.status]??'Not checked'}`:`${title}: ${percentage}%`}>
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="confidence-ring-track" cx="60" cy="60" r="50"/><circle className="confidence-ring-fill" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${percentage??0} 100`}/></svg>
        <span className="confidence-ring-number">{percentage===null?'—':`${percentage}%`}</span>
      </div>
      <div><span className="eyebrow">{title}</span><h3>{c?.status==='EXPERIMENTAL'?'Experimental':done?'Review checked':states[c?.status]??'Not checked'}</h3>
        <p>{c?.status==='EXPERIMENTAL'?'Votes + reviewer + code checks':done?`${votes} AI reads agree.`:'Waiting for completed checks.'}</p></div>
    </div>
      {done&&<span className="confidence-state">{c.reviewerAgrees?'Checker agrees':'Review suggested'}</span>}
    </div>
    {valid&&c?.objections?.length>0&&<ul className="confidence-concern confidence-concern-points">{reviewerPoints(c.objections).map((point,i)=><li key={i}>{point}</li>)}</ul>}
    <details><summary>How your score adds up</summary>
      {c?.objections?.length>0&&<details><summary>Full reviewer explanation</summary>{c.objections.map((text,i)=><p key={i}>{text}</p>)}</details>}
      {c?.combination&&<><p>Experimental points, not a probability of correctness.</p><ul>
        <li>Permutation votes: {c.combination.permutation.points.toFixed(1)} / 60</li>
        <li>Independent reviewer: {c.combination.reviewer.points} / 20</li>
        <li>Human-written code: {c.combination.code.points===null?'Not covered by a rule':`${c.combination.code.points.toFixed(1)} / 20`}</li>
      </ul><p>{votes} reads agree. Final score = earned points ÷ {c.combination.availablePoints} available points × 100. Unsupported code rules are excluded, not counted as evidence against the finding.</p></>}
<p>Agreement is not measured accuracy. Two models each check the same finding three ways. A separate AI checker sees the original words, without seeing the votes. Source checks cannot be outvoted. Failed checks are never counted as agreeing votes.</p><p>The fixed weights are 60% votes, 20% reviewer and 20% code when all components are available. Reviewer agreement with unresolved concerns earns half reviewer points. Statistical calibration still requires human-approved examples; these weights are not trained.</p>
      {Number.isFinite(c?.spentUsd)&&<p>Usage estimate for this finding: US ${c.spentUsd.toFixed(4)}. Not verified billing.</p>}
    </details>
  </section>;
}
