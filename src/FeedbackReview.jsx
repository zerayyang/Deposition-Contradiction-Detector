import {useEffect,useMemo,useRef,useState} from 'react';
import {createFeedbackStore} from './lib/feedbackStore.js';
import {createPracticeStore,PRACTICE_PROPOSAL} from './lib/practiceStore.js';
import './feedback.css';
const categories=[['DIRECT','Direct'],['INFERENTIAL','Inferential'],['FALSE_POSITIVE','False positive']];
const label=value=>categories.find(([key])=>key===value)?.[1]??value;

export function CorrectionForm({client,caseId,finding,findingIndex,disabled=false,saved=false}){
 const [type,setType]=useState(finding.type),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[sent,setSent]=useState(0);
 const lock=useRef(false),request=useRef(null);
 async function submit(e){
  e.preventDefault();if(disabled||!saved||lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const payload={caseId,findingIndex,finding,proposedType:type,rationale:reason};const key=JSON.stringify(payload);
   if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
   await createFeedbackStore(client).submit({...payload,requestId:request.current.id});
   // The first send says submitted; any later send (including a double click) says submitted again.
   setMessage(sent?'✓ Changes submitted again.':'✓ Correction submitted.');setSent(n=>n+1);
  }catch(err){setError(err.message);}finally{lock.current=false;setBusy(false);}
 }
 return <details className="improve-card"><summary>Review &amp; Improve</summary><p>Think this category is wrong? Suggest a correction and explain it using the testimony.</p>
  {!saved&&<p className="feedback-notice">Save this case and its current findings first.</p>}
  <form onSubmit={submit}><fieldset disabled={disabled||!saved||busy}><label>Suggested category<select value={type} onChange={e=>{setType(e.target.value);setMessage('');}}>{categories.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
  <label>Why should it change?<textarea rows={3} maxLength={4000} required value={reason} onChange={e=>{setReason(e.target.value);setMessage('');}} placeholder="Explain which statements conflict, or why they can both be true."/></label>
  <button type="submit" disabled={!reason.trim()}>{busy?'Submitting…':sent?'Submit again':'Submit correction'}</button></fieldset></form>
  <small>Submitting does not train the model, change the score or approve a lesson. A separate assigned reviewer must check it.</small>
  {error&&<p className="feedback-error" role="alert">{error}</p>}{message&&<p role="status" className="feedback-sent">{message}</p>}
 </details>;
}

// practiceStore: the same form and rules, saved nowhere (see lib/practiceStore.js).
function ProposalReview({client,proposal,userId,onUpdated,practiceStore=null}){
 const store=useMemo(()=>practiceStore??createFeedbackStore(client),[practiceStore,client]);const practice=Boolean(practiceStore);
 const [state,setState]=useState(null),[sources,setSources]=useState(null),[allowed,setAllowed]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [decision,setDecision]=useState('NEEDS_CONTEXT'),[reason,setReason]=useState(''),[checked,setChecked]=useState(false);
 const [lesson,setLesson]=useState(''),[terms,setTerms]=useState(''),[attested,setAttested]=useState(false);const lock=useRef(false);
 useEffect(()=>{let live=true;
  Promise.all([store.reviewState(proposal.id),store.canReview(proposal.owner_id),store.reviewSources(proposal.id)]).then(([s,a,context])=>{if(live){setState(s);setAllowed(a===true);setSources(context);setLesson(s.release?.lesson??'');setTerms(s.release?.search_terms?.join(', ')??'');setLoading(false);}}).catch(e=>{if(live){setError(e.message);setLoading(false);}});
  return()=>{live=false;};
 },[store,proposal.id,proposal.owner_id]);
 async function act(action){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await action(store);setState(await store.reviewState(proposal.id));setChecked(false);setAttested(false);setReason('');setNotice(practice?'Practice: this would have been saved. Nothing was saved and the AI did not change.':'Saved. The original detector finding and score are unchanged.');onUpdated?.();}
  catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 const unchanged=sources?.sourcesUnchanged&&sources?.findingUnchanged;
 const approved=state?.decision?.decision==='APPROVE',own=!practice&&proposal.owner_id===userId;
 // Say why the save button is disabled instead of leaving it silently grey.
 const blockers=[!reason.trim()&&'Add a review explanation.',decision==='APPROVE'&&!unchanged&&'The case changed after this correction, so it cannot be approved.',decision==='APPROVE'&&unchanged&&!checked&&'Tick “I checked both original sources” to approve.'].filter(Boolean);
 return <article className={`proposal-review${practice?' practice':''}`}>{practice&&<p className="practice-banner"><b>Practice decision</b> · fictional example · nothing is saved and the AI does not learn from it.</p>}<div className="feedback-columns">{[1,2].map(i=><blockquote key={i}><small>Original finding · transcript {i}</small><p>{proposal.original_snapshot?.finding?.['claim'+i]?.original??'No quote available'}</p></blockquote>)}</div>
  <p><b>{label(proposal.original_snapshot?.finding?.type)} → {label(proposal.proposed_type)}</b></p><p>{proposal.rationale}</p>
  {loading&&<p role="status">Loading review and source context…</p>}
  {state&&<p>Latest decision: <b>{state.decision?.decision?.replaceAll('_',' ')??'Awaiting review'}</b>{state.release?.enabled?' · Private lesson released':''}</p>}
  {state?.decision&&<p>{state.decision.rationale}</p>}
  {sources&&<details className="feedback-sources"><summary>Read both original transcripts · {sources.caseTitle}</summary><p>Check the questions, witness and occasion before deciding.</p><div className="feedback-columns">{[1,2].map(i=><section key={i}><h4>Transcript {i}</h4><pre>{sources['transcript'+i]}</pre></section>)}</div></details>}
  {sources&&!unchanged&&<p className="feedback-error">The saved sources or finding changed after this proposal. Approval is disabled. Ask the owner to submit a correction for the current result.</p>}
  {own&&<p className="feedback-notice">Your correction needs a separately assigned reviewer. Repeated submissions are not votes.</p>}
  {!own&&!allowed&&!loading&&<p>You are not currently assigned to review this owner’s feedback.</p>}
  {allowed&&!approved&&state&&<form onSubmit={e=>{e.preventDefault();if(decision==='APPROVE'&&(!unchanged||!checked))return;act(store=>store.review({feedbackId:proposal.id,decision,rationale:reason,sourceChecked:checked,expectedDecisionId:state.decision?.id??null}));}}><fieldset disabled={busy}>
   <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="NEEDS_CONTEXT">Needs more context</option><option value="APPROVE">Approve correction</option><option value="REJECT">Reject correction</option></select></label>
   <label>Review explanation<textarea required maxLength={4000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <label className="feedback-check"><input type="checkbox" checked={checked} disabled={!unchanged} onChange={e=>setChecked(e.target.checked)}/>I checked both original sources, speaker and occasion.</label>
   <button disabled={blockers.length>0}>{practice?'Test decision':'Save review decision'}</button>{blockers.length>0&&<ul className="feedback-blockers">{blockers.map(b=><li key={b}>{b}</li>)}</ul>}
  </fieldset></form>}
  {allowed&&approved&&<><form onSubmit={e=>{e.preventDefault();act(store=>store.review({feedbackId:proposal.id,decision:'REVOKE',rationale:reason,sourceChecked:false,expectedDecisionId:state.decision.id}));}}><fieldset disabled={busy}><label>Reason to withdraw approval<textarea required maxLength={4000} rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={!reason.trim()}>Withdraw approval</button></fieldset></form>
   {state.example&&<details className="lesson-release"><summary>Optional: release a private lesson</summary><p>An approved correction is not automatically memory. Write a general lesson without names, quotations, case facts or evaluation answers.</p><form onSubmit={e=>{e.preventDefault();if(!unchanged)return;act(store=>store.releaseMemory({exampleId:state.example.id,enabled:true,lesson,searchTerms:terms.split(',').map(t=>t.trim()),notEvaluationMaterial:attested}));}}><fieldset disabled={busy}>
    <label>General lesson<textarea required maxLength={1500} rows={3} value={lesson} onChange={e=>setLesson(e.target.value)}/></label><label>Search phrases · separate with commas<input required value={terms} onChange={e=>setTerms(e.target.value)} placeholder="same occasion, denial"/></label>
    <label className="feedback-check"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>I checked that this contains no private case details or evaluation material.</label>
    <button disabled={!attested||!unchanged||!lesson.trim()}>{practice?'Test releasing lesson':'Release private lesson'}</button>{!attested&&<ul className="feedback-blockers"><li>Tick the box above to release.</li></ul>}
   </fieldset></form>
   {state.release?.enabled&&<button disabled={busy} onClick={()=>act(store=>store.releaseMemory({exampleId:state.example.id,enabled:false,lesson:state.release.lesson,searchTerms:state.release.search_terms,notEvaluationMaterial:true}))}>Disable this lesson</button>}
   <small>{practice?'Practice only: no lesson reaches the AI.':'Only this case owner\u2019s future analyses use a released lesson. It cannot set numeric confidence. This is retrieval, not model training.'}</small></details>}
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p className="feedback-error" role="alert">{error} Reload the review before retrying a changed decision.</p>}
 </article>;
}

// adminView: the admin portal shows only reviews assigned to this account, with no inbox header.
export function FeedbackInbox({client,userId,onClose,adminView=false}){
 const [rows,setRows]=useState([]),[next,setNext]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null);const lock=useRef(false);
 async function load(offset){if(lock.current)return;lock.current=true;setLoading(true);setError('');try{const page=await createFeedbackStore(client).listInbox({offset});setRows(old=>offset===0?page.rows:[...old,...page.rows.filter(row=>!old.some(r=>r.id===row.id))]);setNext(page.nextOffset);}catch(e){setError(e.message);}finally{lock.current=false;setLoading(false);}}
 useEffect(()=>{let live=true;createFeedbackStore(client).listInbox().then(page=>{if(live){setRows(page.rows);setNext(page.nextOffset);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[client]);
 const shown=adminView?rows.filter(row=>row.owner_id!==userId):rows;
 const [practiceStore,setPracticeStore]=useState(null);
 return <section className="feedback-inbox" aria-label="Review and improve inbox">{!adminView&&<header><div><span className="eyebrow">REVIEW &amp; IMPROVE</span><h2>Corrections</h2><p>Your proposals and reviews assigned to you. Nothing is automatically approved.</p></div><button onClick={onClose} disabled={loading}>Close</button></header>}
  <button disabled={loading} onClick={()=>{setSelected(null);load(0);}}>Refresh reviews</button>{error&&<p className="feedback-error" role="alert">{error}</p>}
  {loading&&rows.length===0&&<p className="muted">Loading reviews…</p>}
  {shown.length===0&&!loading&&!error&&<p>{adminView?'No corrections are waiting for your review.':'No corrections yet. Open a saved finding to suggest one.'}</p>}
  <div className="feedback-list">{adminView&&<button className="practice-entry" aria-pressed={selected==='practice'} onClick={()=>{setPracticeStore(createPracticeStore());setSelected('practice');}}>Practice decision · try approve and lesson safely</button>}{shown.map(row=><button key={row.id} aria-pressed={selected===row.id} onClick={()=>setSelected(row.id)}>{adminView?'Suggested':row.owner_id===userId?'Your proposal':'Assigned review'} · {label(row.proposed_type)} · {new Date(row.created_at).toLocaleDateString()}</button>)}</div>
  {next!==null&&<button disabled={loading} onClick={()=>load(next)}>{loading?'Loading…':'Load more'}</button>}
  {selected==='practice'&&practiceStore&&<ProposalReview key={'practice'} client={client} proposal={PRACTICE_PROPOSAL} userId={userId} practiceStore={practiceStore}/>}
  {selected&&shown.find(r=>r.id===selected)&&<ProposalReview key={selected} client={client} proposal={shown.find(r=>r.id===selected)} userId={userId}/>}
  {!adminView&&<small>Reviewer assignments are managed by the database administrator. Owners cannot assign or approve themselves.</small>}
 </section>;
}
