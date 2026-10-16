import {useEffect,useRef,useState} from 'react';
import {analysisBody,previewAnalysis,runAnalysis,eventRecoveryRequest} from './lib/analysisClient.js';
import {documentMetadata} from './lib/documentStore.js';
import {readApiJson} from './lib/apiResponse.js';

export default function EventReview({caseId,draft,fetchImpl,onCheckpoint,onBusy,onTick,onTiming,onPlanning=()=>{},disabled}){
 const saved=draft.analysis?.eventState;
 const [speakersOpen,setSpeakersOpen]=useState(false);
 const [running,setRunning]=useState(false);
 const [editingNew,setEditingNew]=useState(false);
 const [jobs,setJobs]=useState(null);
 const [roles,setRoles]=useState(()=>saved?.speakerRoles??[{},{}]);
 const [sameWitness,setSameWitness]=useState(saved?.sameWitnessConfirmed??false);
 const [labels,setLabels]=useState(null),[plan,setPlan]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const controller=useRef(null),lock=useRef(false),approvalHeading=useRef(null);
 useEffect(()=>{if(plan)approvalHeading.current?.focus();},[plan]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const state=draft.analysis?.eventState;
 const bodyFor=(phase,continuing)=>({...analysisBody(draft.texts,draft.files),workflow:'events-v1',phase,caseId,originalDocuments:draft.files.map(documentMetadata),speakerRoles:roles,sameWitnessConfirmed:sameWitness,
  ...(continuing&&state?{eventState:state,...(draft.analysis.eventJobId?{eventJobId:draft.analysis.eventJobId}:{})}:{})});
 async function inspect(){
  if(lock.current)return;lock.current=true;
  setError('');setBusy(true);onBusy(true);
  try{const response=await fetchImpl('/api/events/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript1:draft.texts[0],transcript2:draft.texts[1]})});const data=await readApiJson(response,'Could not inspect source speakers.');setLabels(data.documents);}
  catch(e){setError(e.message);if(/speaker|role/i.test(e.message))setSpeakersOpen(true);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function prepare(phase,continuing){
  if(lock.current)return;lock.current=true;
  setBusy(true);onBusy(true);setError('');
  try{const body=bodyFor(phase,continuing);const preview=await previewAnalysis(body,{fetchImpl});setPlan({preview,body});onPlanning(true);}
  catch(e){setError(e.message);if(/speaker|role/i.test(e.message))setSpeakersOpen(true);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function start(){
  if(lock.current||!plan)return;
  if(plan.body.transcript1!==draft.texts[0]||plan.body.transcript2!==draft.texts[1]){setPlan(null);onPlanning(false);setError('The source texts changed. Review a new cost plan before starting.');return;}
  lock.current=true;
  const pending=plan;setPlan(null);onPlanning(false);setEditingNew(false);setRunning(true);setBusy(true);onBusy(true);setError('');
  const abort=new AbortController();controller.current=abort;
  onTiming(null);onTick(0);
  const began=performance.now(),timer=setInterval(()=>onTick(Math.floor((performance.now()-began)/1000)),1000);let latest=null;
  setNotice('Starting '+(pending.body.phase==='extract'?'reading the transcripts':'comparing the accounts')+'…');
  try{
   // Source inputs must already be saved before starting a paid request.
   await onCheckpoint(draft);abort.signal.throwIfAborted();
   const result=await runAnalysis(pending.body,pending.preview,{signal:abort.signal,fetchImpl,onEvent:async event=>{
    if(event.event==='start'){
     latest={...draft,results:pending.body.phase==='extract'?[]:draft.results,analysis:{workflow:'events-v1',phase:pending.body.phase,status:'running',planned:pending.preview.totalRequestCount,completed:pending.preview.cachedRequests,failed:0,partial:0,attempted:0,eventJobId:event.eventJobId,eventState:pending.body.eventState??null},dirty:true};await onCheckpoint(latest);
    }
    if(event.event==='progress')setNotice((pending.body.phase==='extract'?'Reading testimony':'Comparing accounts')+' · '+event.attempted+' new AI requests started.');
    if(event.analysis){
     const processed=event.analysis.tasks.filter(t=>!t.reused&&['completed','failed','partial'].includes(t.status)).length;
     onTiming({processed,processedThisRun:processed,remaining:pending.preview.requestCount-processed,elapsed:(performance.now()-began)/1000});
     latest={...draft,results:event.contradictions,analysis:event.analysis,seconds:(performance.now()-began)/1000,notes:pending.body.phase==='extract'?{}:draft.notes,reviewed:pending.body.phase==='extract'?{}:draft.reviewed,selected:0,dirty:true};await onCheckpoint(latest);}
   }});
   setNotice(result.analysis.status==='awaiting_comparison'?'Reading finished. You can review the notes, then check the comparison cost.':result.analysis.status==='complete'?'Comparison finished. Review the findings; the AI may still have missed something.':'The review is incomplete. Check the saved progress before trying again.');
  }catch(e){
   abort.abort();setError(e.message);
   if(latest){latest={...latest,analysis:{...latest.analysis,status:'interrupted',interruption:e.message},dirty:true};try{await onCheckpoint(latest);}catch{setError('Cloud checkpoint failed. Keep this tab open; use Save case. Server recovery may still be available.');}}
  }finally{clearInterval(timer);controller.current=null;setRunning(false);lock.current=false;setBusy(false);onBusy(false);}
 }
 async function listJobs(){
  if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError('');
  try{const result=await eventRecoveryRequest(fetchImpl,'?caseId='+encodeURIComponent(caseId));setJobs(result.jobs);if(!result.recoveryEnabled)setNotice('No persistent server recovery on this host. Saved cloud case checkpoints remain available.');}catch(e){setError(e.message);if(/speaker|role/i.test(e.message))setSpeakersOpen(true);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function recover(id=draft.analysis.eventJobId){
  if(lock.current)return;lock.current=true;
  setBusy(true);onBusy(true);setError('');
  try{const response=await fetchImpl('/api/events/jobs/'+encodeURIComponent(id));const record=await readApiJson(response,'Recovery unavailable.');if(record.caseId!==caseId||record.texts[0]!==draft.texts[0]||record.texts[1]!==draft.texts[1])throw new Error('Recovery does not match this case and its texts.');if(record.state==='running')throw new Error('The server is still processing. Wait for it to stop before recovery.');if(!record.result)throw new Error('No result checkpoint is available yet.');setRoles(record.result.analysis.eventState.speakerRoles);setSameWitness(record.result.analysis.eventState.sameWitnessConfirmed);await onCheckpoint({...draft,results:record.result.contradictions,analysis:{...record.result.analysis,status:record.result.analysis.status==='running'?'interrupted':record.result.analysis.status},dirty:true});}
  catch(e){setError(e.message);if(/speaker|role/i.test(e.message))setSpeakersOpen(true);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 const locked=busy||disabled;
 const hasBoth=draft.texts.every(text=>text.trim().length>0);
 const complete=!editingNew&&state?.comparison?.status==='COMPLETE';
 const readyToCompare=!editingNew&&state?.extraction.status==='COMPLETE';
 const stage=running?'Review in progress':readyToCompare?(state.comparison?'Review saved':'Ready to compare'):'Ready to read';
 return <section className="event-review" aria-label="Event review workflow" aria-busy={busy}>
  <header className="event-review-heading"><div><h2>{complete?'Review your findings':readyToCompare?'Compare the accounts':'Compare your transcripts'}</h2><p>{complete?'The review is saved. Check the findings alongside their original quotations.':readyToCompare?'Your reading notes are saved. Review the comparison cost when you’re ready.':'First we read both transcripts. You approve the cost again before we compare them.'}</p></div><span className="event-step">{stage}</span></header>
  {caseId==='sample'&&<p className="event-hint">Save this sample as a case to begin.</p>}
  {!hasBoth&&<p className="event-hint">Add both transcripts above to begin.</p>}
  <label className="event-confirmation"><input type="checkbox" checked={sameWitness} disabled={locked||Boolean(state)&&!editingNew} onChange={e=>setSameWitness(e.target.checked)}/><span>Both transcripts are from the same witness.</span></label>
  {!sameWitness&&<p className="event-hint">Not sure? You can continue, but some checks will need review.</p>}
  <details className="event-speakers" open={speakersOpen} onToggle={e=>setSpeakersOpen(e.currentTarget.open)}><summary>Who is speaking?</summary><p>For named speakers, choose who is giving testimony and who is asking questions.</p>
   <button className="event-button-secondary" disabled={locked||Boolean(state)&&!editingNew} onClick={inspect}>Check speakers · free</button>
   {labels?.map((doc,i)=><div className="event-speaker-group" key={i}><h3>Transcript {i+1}</h3>{doc.labels.length===0?<p>No named speakers need assigning. This does not confirm the witness’s identity.</p>:doc.labels.map(name=><label className="event-speaker-row" key={name}><span>{name}</span><select disabled={locked||Boolean(state)&&!editingNew} value={roles[i][name]??''} onChange={e=>setRoles(old=>old.map((m,n)=>n===i?{...m,[name]:e.target.value}:m))}><option value="">Choose role</option><option value="WITNESS">Giving testimony</option><option value="QUESTIONER">Asking questions</option><option value="OTHER">Other speaker</option></select></label>)}</div>)}
  </details>
  {!plan&&<div className="event-main-action">
   {(!state||editingNew)&&<button className="event-button-primary" disabled={locked||caseId==='sample'||!hasBoth} onClick={()=>prepare('extract',false)}>Review reading cost <span aria-hidden="true">→</span></button>}
   {complete&&<a className="event-button-primary" href="#review-findings">View findings <span aria-hidden="true">↓</span></a>}
   {readyToCompare&&!complete&&<button className="event-button-primary" disabled={locked} onClick={()=>prepare('compare',true)}>{state.comparison?'Review cost to continue':'Review comparison cost'} <span aria-hidden="true">→</span></button>}
   {!editingNew&&state&&state.extraction.status!=='COMPLETE'&&<button className="event-button-primary" disabled={locked} onClick={()=>prepare('extract',true)}>Review cost to continue <span aria-hidden="true">→</span></button>}
   {running&&<button className="event-button-secondary" onClick={()=>controller.current?.abort()}>Cancel review</button>}
   <span className="event-hint">{complete?'Opening saved findings is free.':'Nothing is charged until you approve.'}</span>
  </div>}
  {plan&&<section className="event-approval" aria-label="Review cost before analysis"><div className="event-approval-heading"><h3 ref={approvalHeading} tabIndex={-1}>{plan.preview.phase==='extract'?'Read both transcripts':'Compare the accounts'}</h3><span>{plan.preview.requestCount} new AI requests</span></div><div className="event-cost"><div><span>Estimated cost</span><strong>US ${plan.preview.cost.estimated.toFixed(2)}</strong></div><div><span>Conservative budget</span><strong>US ${plan.preview.cost.conservativeBudget.toFixed(2)}</strong></div></div>
   <p>These are estimates, not a billing guarantee. Work already sent to the AI may still be charged if you cancel.</p>
   {plan.preview.phase==='extract'&&<p>This pays for reading only. We’ll show a separate comparison price afterwards.</p>}
   {plan.preview.cachedRequests>0&&<p>{plan.preview.cachedRequests} saved responses will be checked again without new AI calls.</p>}
   {!plan.preview.recoveryEnabled&&<p className="event-hint">This host saves progress to your case as results arrive. Work interrupted before a result is saved may need to run again.</p>}
   <div className="event-main-action"><button className="event-button-primary" disabled={busy} onClick={start}>{plan.preview.requestCount===0?'Restore saved results':`Approve ${plan.preview.requestCount} paid requests`}</button><button className="event-button-secondary" disabled={busy} onClick={()=>{setPlan(null);onPlanning(false);}}>Go back</button></div>
  </section>}
  {notice&&<p role="status" className="event-notice">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
  {state&&<details className="event-audit"><summary>Review reading notes and sources</summary><p>These notes are the AI’s interpretation. Quotations are checked against the text; that does not prove the interpretation is right.</p>{state.extraction.documents.map((doc,i)=><div key={doc.documentId}><h3>Transcript {i+1} · {doc.events.length} notes</h3><p>{doc.coverage.segments.filter(s=>s.status==='PROCESSED').length} of {doc.coverage.segments.length} sections read · {doc.coverage.status.toLowerCase()}.</p>{doc.events.map(e=><article key={e.id}><h4>{e.summary}</h4>{e.sources.map(s=><blockquote key={s.id}><small>{s.role==='QUESTION'?'Question':'Witness'} · {s.pageRefs.length?s.pageRefs.map(p=>'PDF page '+p.pdfPage).join(', '):'text characters '+s.start+'–'+s.end}</small><p>{s.quote}</p></blockquote>)}<details><summary>Recorded details</summary><p>{e.kind} · {e.assertion.polarity.toLowerCase()}</p><ul>{e.attributes.map((a,n)=><li key={n}>{a.name}: {a.value??a.state.toLowerCase()} ({a.basis.toLowerCase()})</li>)}</ul></details>{e.unresolvedReasons.map((reason,n)=><p key={n}>{reason}</p>)}</article>)}</div>)}</details>}
  {state?.comparison&&<details className="event-audit"><summary>Matches needing clarification</summary>{state.comparison.tasks.flatMap(t=>(t.pairs??[]).filter(p=>p.reviewRequired).map(p=><p key={t.id+p.pairId}>{p.reason} {p.reviewReasons.join(' ')}</p>))}</details>}
  <details className="event-options"><summary>Saved progress & options</summary><p>Find an interrupted review or start again. Finding saved progress does not call the AI.</p><div className="event-option-actions">
   <button className="event-button-secondary" disabled={locked||caseId==='sample'} onClick={listJobs}>Find saved progress</button>
   {draft.analysis?.eventJobId&&<button className="event-button-secondary" disabled={locked} onClick={()=>recover()}>Restore latest checkpoint</button>}
   {editingNew&&<button className="event-button-secondary" disabled={locked} onClick={()=>{setEditingNew(false);setRoles(state.speakerRoles);setSameWitness(state.sameWitnessConfirmed);setPlan(null);}}>Keep previous review</button>}
   {state&&!editingNew&&<button className="event-button-secondary" disabled={locked} onClick={()=>{if(window.confirm('Start a new reading plan? Your saved review stays until you approve a replacement.')){setEditingNew(true);setNotice('Check the witness and speakers, then review the new reading cost.');}}}>Start a new review</button>}
  </div>{jobs&&<ul>{jobs.length?jobs.map(job=><li key={job.id}>{job.state} · {new Date(job.updatedAt).toLocaleString()} <button className="event-button-secondary" disabled={locked||job.state==='running'} onClick={()=>recover(job.id)}>Restore</button>{!job.backendMatches&&' The app changed; this checkpoint is for review only.'}</li>):<li>No server checkpoints were found for this case.</li>}</ul>}
   {draft.analysis?.eventSummary&&<p>{draft.analysis.eventSummary.allComparisons} comparisons assessed; {draft.analysis.eventSummary.suppressedComparisons} additional comparisons kept in the report; {draft.analysis.eventSummary.unresolvedPairs} matches need review.</p>}
  </details>
 </section>;
}
