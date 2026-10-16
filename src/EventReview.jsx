import {useEffect,useRef,useState} from 'react';
import {analysisBody,previewAnalysis,runAnalysis,eventRecoveryRequest} from './lib/analysisClient.js';
import {documentMetadata} from './lib/documentStore.js';
import {readApiJson} from './lib/apiResponse.js';

export default function EventReview({caseId,draft,fetchImpl,onCheckpoint,onBusy,onTick,onTiming,onPlanning=()=>{},disabled}){
 const saved=draft.analysis?.eventState;
 const [running,setRunning]=useState(false);
 const [editingNew,setEditingNew]=useState(false);
 const [jobs,setJobs]=useState(null);
 const [roles,setRoles]=useState(()=>saved?.speakerRoles??[{},{}]);
 const [sameWitness,setSameWitness]=useState(saved?.sameWitnessConfirmed??false);
 const [labels,setLabels]=useState(null),[plan,setPlan]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const controller=useRef(null),lock=useRef(false);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const state=draft.analysis?.eventState;
 const bodyFor=(phase,continuing)=>({...analysisBody(draft.texts,draft.files),workflow:'events-v1',phase,caseId,originalDocuments:draft.files.map(documentMetadata),speakerRoles:roles,sameWitnessConfirmed:sameWitness,
  ...(continuing&&state?{eventState:state,...(draft.analysis.eventJobId?{eventJobId:draft.analysis.eventJobId}:{})}:{})});
 async function inspect(){
  if(lock.current)return;lock.current=true;
  setError('');setBusy(true);onBusy(true);
  try{const response=await fetchImpl('/api/events/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript1:draft.texts[0],transcript2:draft.texts[1]})});const data=await readApiJson(response,'Could not inspect source speakers.');setLabels(data.documents);}
  catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function prepare(phase,continuing){
  if(lock.current)return;lock.current=true;
  setBusy(true);onBusy(true);setError('');
  try{const body=bodyFor(phase,continuing);const preview=await previewAnalysis(body,{fetchImpl});setPlan({preview,body});onPlanning(true);}
  catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function start(){
  if(lock.current||!plan)return;
  if(plan.body.transcript1!==draft.texts[0]||plan.body.transcript2!==draft.texts[1]){setPlan(null);onPlanning(false);setError('The source texts changed. Review a new cost plan before starting.');return;}
  lock.current=true;
  const pending=plan;setPlan(null);onPlanning(false);setEditingNew(false);setRunning(true);setBusy(true);onBusy(true);setError('');
  const abort=new AbortController();controller.current=abort;
  onTiming(null);onTick(0);
  const began=performance.now(),timer=setInterval(()=>onTick(Math.floor((performance.now()-began)/1000)),1000);let latest=null;
  setNotice('Starting '+(pending.body.phase==='extract'?'event extraction':'event comparison')+'…');
  try{
   // Source inputs must already be saved before starting a paid request.
   await onCheckpoint(draft);abort.signal.throwIfAborted();
   const result=await runAnalysis(pending.body,pending.preview,{signal:abort.signal,fetchImpl,onEvent:async event=>{
    if(event.event==='start'){
     latest={...draft,results:pending.body.phase==='extract'?[]:draft.results,analysis:{workflow:'events-v1',phase:pending.body.phase,status:'running',planned:pending.preview.totalRequestCount,completed:pending.preview.cachedRequests,failed:0,partial:0,attempted:0,eventJobId:event.eventJobId,eventState:pending.body.eventState??null},dirty:true};await onCheckpoint(latest);
    }
    if(event.event==='progress')setNotice('Processing '+pending.body.phase+' request. '+event.attempted+' new requests started.');
    if(event.analysis){
     const processed=event.analysis.tasks.filter(t=>!t.reused&&['completed','failed','partial'].includes(t.status)).length;
     onTiming({processed,processedThisRun:processed,remaining:pending.preview.requestCount-processed,elapsed:(performance.now()-began)/1000});
     latest={...draft,results:event.contradictions,analysis:event.analysis,seconds:(performance.now()-began)/1000,notes:pending.body.phase==='extract'?{}:draft.notes,reviewed:pending.body.phase==='extract'?{}:draft.reviewed,selected:0,dirty:true};await onCheckpoint(latest);}
   }});
   setNotice(result.analysis.status==='awaiting_comparison'?'Events saved. Review them, then approve the separate comparison cost.':result.analysis.status==='complete'?'All planned event comparisons processed. Review findings and coverage; this does not guarantee every contradiction was found.':'Incomplete review. Check saved events and failures before approving any retry.');
  }catch(e){
   abort.abort();setError(e.message);
   if(latest){latest={...latest,analysis:{...latest.analysis,status:'interrupted',interruption:e.message},dirty:true};try{await onCheckpoint(latest);}catch{setError('Cloud checkpoint failed. Keep this tab open; use Save case. Server recovery may still be available.');}}
  }finally{clearInterval(timer);controller.current=null;setRunning(false);lock.current=false;setBusy(false);onBusy(false);}
 }
 async function listJobs(){
  if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError('');
  try{const result=await eventRecoveryRequest(fetchImpl,'?caseId='+encodeURIComponent(caseId));setJobs(result.jobs);if(!result.recoveryEnabled)setNotice('No persistent server recovery on this host. Saved cloud case checkpoints remain available.');}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function recover(id=draft.analysis.eventJobId){
  if(lock.current)return;lock.current=true;
  setBusy(true);onBusy(true);setError('');
  try{const response=await fetchImpl('/api/events/jobs/'+encodeURIComponent(id));const record=await readApiJson(response,'Recovery unavailable.');if(record.caseId!==caseId||record.texts[0]!==draft.texts[0]||record.texts[1]!==draft.texts[1])throw new Error('Recovery does not match this case and its texts.');if(record.state==='running')throw new Error('The server is still processing. Wait for it to stop before recovery.');if(!record.result)throw new Error('No result checkpoint is available yet.');setRoles(record.result.analysis.eventState.speakerRoles);setSameWitness(record.result.analysis.eventState.sameWitnessConfirmed);await onCheckpoint({...draft,results:record.result.contradictions,analysis:{...record.result.analysis,status:record.result.analysis.status==='running'?'interrupted':record.result.analysis.status},dirty:true});}
  catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 const locked=busy||disabled;
 return <section className="analysis-status" aria-label="Event review workflow">
  <h2>Review through source-linked events</h2><p>First collect events from both complete documents. Then compare every event block across documents. Each phase needs its own cost approval.</p>
  <label><input type="checkbox" checked={sameWitness} disabled={locked||Boolean(state)&&!editingNew} onChange={e=>setSameWitness(e.target.checked)}/> I have checked that these documents concern the same witness.</label>
  <p><button disabled={locked||Boolean(state)&&!editingNew} onClick={inspect}>Review speaker labels · no AI calls</button></p>
  {labels?.map((doc,i)=><div key={i}><b>Transcript {i+1}</b>{doc.labels.length===0?<p>No unassigned named speaker labels. Plain text still does not establish identity.</p>:doc.labels.map(name=><label key={name} style={{display:'block'}}>{name} <select disabled={locked||Boolean(state)&&!editingNew} value={roles[i][name]??''} onChange={e=>setRoles(old=>old.map((m,n)=>n===i?{...m,[name]:e.target.value}:m))}><option value="">Choose role</option><option value="WITNESS">Witness</option><option value="QUESTIONER">Questioner</option><option value="OTHER">Other speaker</option></select></label>)}</div>)}
  {state&&<p>Saved extraction: {state.extraction.status.toLowerCase()}. Transcript event counts: {state.extraction.documents.map(d=>d.events.length).join(' / ')}. Source roles and identity confirmation belong to this saved run. Plan a new extraction to change them.</p>}
  <div className="event-controls">
   <button disabled={locked||caseId==='sample'} onClick={listJobs}>Find saved event recovery · no AI calls</button>
   {(!state||editingNew)&&<button disabled={locked||caseId==='sample'} onClick={()=>prepare('extract',false)}>Review extraction cost</button>}
   {!editingNew&&state?.extraction.status==='COMPLETE'&&<button disabled={locked} onClick={()=>prepare('compare',true)}>{state.comparison?'Review comparison / retry cost':'Review comparison cost'}</button>}
   {!editingNew&&state&&state.extraction.status!=='COMPLETE'&&<button disabled={locked} onClick={()=>prepare('extract',true)}>Review unfinished extraction cost</button>}
   {draft.analysis?.eventJobId&&<button disabled={locked} onClick={()=>recover()}>Recover server checkpoint</button>}
   {editingNew&&<button disabled={locked} onClick={()=>{setEditingNew(false);setRoles(state.speakerRoles);setSameWitness(state.sameWitnessConfirmed);setPlan(null);}}>Keep previous event review</button>}
   {state&&!editingNew&&<button disabled={locked} onClick={()=>{if(window.confirm('Plan a new extraction? Existing events remain saved until you approve a replacement run.')){setEditingNew(true);setNotice('Review source roles and witness identity for the new extraction, then review its cost.');}}}>Plan a new extraction</button>}
   {running&&<button onClick={()=>controller.current?.abort()}>Cancel · in-flight work may be billed</button>}
  </div>
  {jobs&&<ul>{jobs.length?jobs.map(job=><li key={job.id}>{job.state} · {job.updatedAt} <button disabled={locked||job.state==='running'} onClick={()=>recover(job.id)}>Recover checkpoint</button>{!job.backendMatches&&' Backend changed; review only.'}</li>):<li>No saved server event reviews for this case.</li>}</ul>}
  {plan&&<div className="event-approval"><h3>Approve {plan.preview.phase==='extract'?'extraction':'comparison'} only</h3><p>{plan.preview.requestCount} new model requests; {plan.preview.cachedRequests} saved responses will be rechecked without new model calls.</p><p>Estimated US ${plan.preview.cost.estimated.toFixed(2)} · conservative reserve US ${plan.preview.cost.conservativeBudget.toFixed(2)}. These are estimates, not a billing guarantee.</p><p>{plan.preview.nextPhase??'All primary event blocks cross both documents; no matching filter silently removes pairs.'}</p>{!plan.preview.recoveryEnabled&&<p>Persistent server recovery is unavailable on this host. Cloud case checkpoints are saved as they arrive; an interrupted in-flight request can still be billed.</p>}<button disabled={busy} onClick={start}>Approve {plan.preview.requestCount} new paid requests</button> <button disabled={busy} onClick={()=>{setPlan(null);onPlanning(false);}}>Go back</button></div>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
  {draft.analysis?.eventSummary&&<p>{draft.analysis.eventSummary.allComparisons} assessed comparisons; {draft.analysis.eventSummary.suppressedComparisons} retained in the report audit without a finding card; {draft.analysis.eventSummary.unresolvedPairs} event matches need review before an assessment is available.</p>}
  {state?.comparison&&<details><summary>Event matching decisions needing review</summary>{state.comparison.tasks.flatMap(t=>(t.pairs??[]).filter(p=>p.reviewRequired).map(p=><p key={t.id+p.pairId}>{p.leftId} / {p.rightId}: {p.reason} {p.reviewReasons.join(' ')}</p>))}</details>}
  {state&&<details><summary>Review extracted events and source references</summary><p>These are AI interpretations with checked quotations, not verified facts.</p>{state.extraction.documents.map((doc,i)=><div key={doc.documentId}><h3>Transcript {i+1}</h3><p>Extraction coverage: {doc.coverage.status.toLowerCase()}; {doc.coverage.segments.filter(s=>s.status==='PROCESSED').length} of {doc.coverage.segments.length} source ranges processed.</p>{doc.events.map(e=><article key={e.id}><h4>{e.summary}</h4><p>{e.kind} · {e.assertion.polarity.toLowerCase()}</p>{e.sources.map(s=><blockquote key={s.id}><small>{s.role==='QUESTION'?'Question':'Witness'} · {s.pageRefs.length?s.pageRefs.map(p=>'PDF page '+p.pdfPage).join(', '):'text offsets '+s.start+'–'+s.end}</small><p>{s.quote}</p></blockquote>)}<ul>{e.attributes.map((a,n)=><li key={n}>{a.name}: {a.value??a.state.toLowerCase()} ({a.basis.toLowerCase()})</li>)}</ul>{e.unresolvedReasons.map((reason,n)=><p key={n}>{reason}</p>)}</article>)}</div>)}</details>}
 </section>;
}
