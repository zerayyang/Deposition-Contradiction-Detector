import {useState, useEffect, useRef} from 'react';
import {hybridBadge, summarizeConfidence} from '../shared/hybridConfidence.js';

const examples = [
  {name: 'Different exact counts', a: 'Q: How many invoices did you sign that day?\nA: Exactly three.', b: 'Q: How many invoices did you sign that same day?\nA: Exactly five.', type: 'DIRECT', votes: ['DIRECT','DIRECT','DIRECT','DIRECT','DIRECT','INFERENTIAL'], reviewer: 'DIRECT', objections: [], strength: 1},
  {name: 'An added meal detail', a: 'Q: What did you eat at the wedding?\nA: Chicken.', b: 'Q: What did you eat at that wedding?\nA: Chicken and salad.', type: 'FALSE_POSITIVE', votes: Array(6).fill('FALSE_POSITIVE'), reviewer: 'FALSE_POSITIVE', objections: [], strength: 0},
  {name: 'Unclear time context', a: 'Q: When did you leave?\nA: Around eight.', b: 'Q: When did you leave?\nA: Around eight thirty.', type: 'INFERENTIAL', votes: ['INFERENTIAL','FALSE_POSITIVE','INFERENTIAL','FALSE_POSITIVE','INFERENTIAL','FALSE_POSITIVE'], reviewer: 'FALSE_POSITIVE', objections: ['The event and AM/PM need clarification.'], strength: 0},
];

export default function HybridConfidence({result, apiFetch, payload, onUpdate}) {
  const [example, setExample] = useState(0);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const controller = useRef(null);
  const inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function post(path, body, signal) {
    const response = await apiFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Confidence review could not finish.');
    return value;
  }
  async function preview() {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setPlan(null);
    const abort = new AbortController();controller.current=abort;
    try {setPlan(await post('/api/confidence/plan',payload,abort.signal));}
    catch(e){setError(abort.signal.aborted?'Stopped. No paid review was started.':e.message);}
    finally {inFlight.current=false;setBusy(false);}
  }
  async function start() {
    if(inFlight.current||!plan)return;
    inFlight.current=true;setBusy(true);setError('');
    const approved=plan;setPlan(null);
    const abort = new AbortController();controller.current=abort;
    try {
      for(let step=0;step<7;step++) {
        setProgress(`Checking ${step+1} of 7…`);
        const value=await post('/api/confidence/step',{caseId:approved.caseId,jobId:approved.jobId,step,approvedBudgetUsd:approved.budgetUsd},abort.signal);
        onUpdate?.({...value.hybridConfidence,jobId:approved.jobId,caseId:approved.caseId,completedSteps:value.completed,
          spentUsd:value.spentUsd,votes:value.votes,reviewer:value.reviewer});
        if(value.stopped)throw new Error('One AI check did not finish. Completed votes were kept. No automatic retry will run.');
      }
      setProgress('Review finished. Save case to keep the confidence results with this finding.');
    } catch(e) {setError(abort.signal.aborted?'Stopped. Completed votes were kept. An in-flight request may still be billed.':e.message);setProgress('');}
    finally {inFlight.current=false;setBusy(false);}
  }
  const item = examples[example];
  const mock = summarizeConfidence({originalType: item.type,
    votes: item.votes.map((type, i) => ({model: i < 3 ? 'mock-a' : 'mock-b', permutation: i % 3, status: 'SUCCESS', type})),
    reviewer: {type: item.reviewer, status: 'SUCCESS', objections: item.objections},
    evidence: {sourcesVerified: true, ruleSupported: item.strength > 0, ruleStrength: item.strength}});
  const actual = result.hybridConfidence;
  return <section className="verification"><span className="eyebrow">Hybrid confidence</span>
    <h3>{hybridBadge(result).value}</h3>
    <p>{actual?.status === 'CALIBRATED' ? 'Estimated reliability of the original category. This is not a probability that the witness is lying.' : 'Not calibrated yet. The old evidence score is no longer presented as classification confidence.'}</p>
    {actual && <p>{actual.agreeingVotes ?? 0} of {actual.expectedVotes ?? 6} votes agree with the original category. Status: {actual.status}.</p>}
    {actual?.reviewer && <p>Separate checker: {actual.reviewer.type ?? 'Did not finish'}. {actual.reviewer.objections?.join(' ')}</p>}
    {Number.isFinite(actual?.spentUsd) && <p>Recorded usage estimate: US ${actual.spentUsd.toFixed(4)}. Not verified billing.</p>}
    {apiFetch && <div>
      <p>Check this finding only. Your original category and evidence score stay unchanged.</p>
      <button type="button" disabled={busy} onClick={preview}>Review confidence cost · free</button>
      {plan && <section aria-label="Approve confidence cost"><p><b>7 paid checks · up to approximately US ${plan.budgetUsd.toFixed(4)}</b></p>
        <p>Two models: {plan.models.join(' and ')}. Experimental; agreement is not calibrated accuracy.</p><p>{plan.notice}</p>
        <button type="button" disabled={busy} onClick={start}>Approve cost and check this finding</button>
        <button type="button" onClick={()=>setPlan(null)}>Go back · no paid checks</button></section>}
      {busy && <button type="button" onClick={()=>controller.current?.abort()}>Cancel confidence review</button>}
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
    <details><summary>Try a fictional example · no AI calls</summary>
      <p>Illustration only. These votes and code checks are supplied mock data, not observed model results.</p>
      <label>Example <select value={example} onChange={e => setExample(Number(e.target.value))}>{examples.map((e, i) => <option key={e.name} value={i}>{e.name}</option>)}</select></label>
      <div className="quote-grid"><blockquote style={{whiteSpace:'pre-wrap'}}>{item.a}</blockquote><blockquote style={{whiteSpace:'pre-wrap'}}>{item.b}</blockquote></div>
      <p><b>Original category: {item.type}</b> — remains unchanged.</p>
      <p>Votes: {item.votes.join(' · ')}</p>
      <p><b>{mock.agreeingVotes}/6 = {Math.round(mock.agreement * 100)}% agreement.</b> This is not measured accuracy.</p>
      <p>Independent reviewer: {item.reviewer}. {item.objections.join(' ') || 'No objection in this mock.'}</p>
      <p>Source checks: pass (mock). Rule strength: {item.strength}. These checks cannot be outvoted.</p>
      <p>Final confidence: <b>unavailable until calibrated</b>. The calibrator learns weights from approved examples; it is not assigned a percentage share.</p>
    </details>
  </section>;
}
