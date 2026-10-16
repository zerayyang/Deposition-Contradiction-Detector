import {resumableCloudJobId} from './lib/cloudAnalysisClient.js';
import { useCallback, useEffect, useRef, useState } from "react";
import { openReviewReport } from "./lib/reviewReport.js";
import RecoveryPanel from "./RecoveryPanel.jsx";
import EventReview from "./EventReview.jsx";
import {CorrectionForm,FeedbackInbox} from "./FeedbackReview.jsx";
import { recoveredDraft, recoveryRequest, beginAnalysisDraft, checkpointSaveWarning } from "./lib/recovery.js";
import AnalysisStatus from "./AnalysisStatus.jsx";
import AuthGate from "./SupabaseCases.jsx";
import { supabase } from "./lib/supabaseClient.js";
import { readTranscriptDocument } from "./lib/readTranscript.js";
import { analysisBody, previewAnalysis, runAnalysis, eventRecoveryRequest } from "./lib/analysisClient.js";
import { checkFileBudget } from "../shared/documentLimits.js";
import { documentMetadata, createDocumentStore } from "./lib/documentStore.js";
import { createCaseStore } from "./lib/caseStore.js";
import { ReviewCard, ScoreGuide } from "./ReviewCard.jsx";
import { TRANSCRIPT_1, TRANSCRIPT_2 } from "./sampleTranscripts.js";
import CaseList from "./CaseList.jsx";
import { CaseActions, DeleteCaseDialog } from "./CaseActions.jsx";
import "./workspace.css";

const label = type => ({ DIRECT: "Direct", INFERENTIAL: "Inferential", FALSE_POSITIVE: "False positive" }[type] ?? "Finding");
const blankDraft = (sample = false) => ({ texts: sample ? [TRANSCRIPT_1, TRANSCRIPT_2] : ["", ""], files: [null, null], results: null, seconds: null, analysis: null, selected: 0, reviewed: {}, notes: {}, dirty: false });
const heading = result => {
  const a = result.claim1?.original ?? "";
  const b = result.claim2?.original ?? "";
  return `${a.slice(0, 54)}${a.length > 54 ? "…" : ""} / ${b.slice(0, 54)}${b.length > 54 ? "…" : ""}`;
};

function TranscriptFile({ index, value, file, onChange, onFile, onOpen, onReadingChange, disabled }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(true);
  const [error, setError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState("");
  const importController = useRef(null);
  async function readFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError("");
    try { checkFileBudget(chosen); } catch(err) { setError(err.message); return; }
    if (!/\.(pdf|txt|md)$/i.test(chosen.name)) { setError("Choose a .pdf, .txt or .md transcript."); return; }
    const controller = new AbortController(); importController.current = controller;
    setFileBusy(true); onReadingChange(true); setFileProgress("Reading file…");
    try { const doc = await readTranscriptDocument(chosen, setFileProgress, {signal:controller.signal}); controller.signal.throwIfAborted(); setFileProgress("Saving original…"); await onFile(doc.text, chosen, doc.extraction, {signal:controller.signal,onProgress:setFileProgress}); setPreview(true); }
    catch (err) { setError(err.name === "AbortError" ? "Import cancelled. Previous case contents were kept." : err.message || "This file could not be saved. Try uploading again."); }
    finally { setFileBusy(false); onReadingChange(false); setFileProgress(""); event.target.value = ""; }
  }
  async function openOriginal() {
    setError("");
    // Open on the user gesture before awaiting the private download.
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) { setError("Allow pop-ups for this site to open the original file."); return; }
    viewer.opener = null;
    try {
      const blob = await onOpen(file);
      const url = URL.createObjectURL(blob);
      viewer.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { viewer.close(); setError(err.message || "The original file could not be opened. Try again."); }
  }
  return <section className="document-card">
    <div className="document-heading"><span className="document-icon">{file?.type === "application/pdf" ? "PDF" : "TXT"}</span><div><h3>{file?.name ?? `Transcript ${index + 1}`}</h3><span>{file?.path ? "Original saved privately" : file ? "Imported text · not uploaded" : value.trim() ? "Pasted testimony" : "Add testimony to begin"}</span></div><button className="document-upload-primary" disabled={disabled || fileBusy} onClick={() => input.current.click()}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></svg>{fileBusy ? "Importing…" : file ? "Replace file" : "Upload file"}</button></div>
    <div className="document-actions"><button className="link-button" aria-expanded={preview} aria-controls={`transcript-text-${index}`} onClick={() => setPreview(!preview)}>{preview ? "Hide text" : "Show text"}</button><button className="link-button" disabled={!file} onClick={openOriginal}>Open original ↗</button><span className="document-formats">PDF, TXT, MD · up to 50 MiB</span></div>
    <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={readFile} hidden disabled={disabled || fileBusy} />
    {preview && <textarea id={`transcript-text-${index}`} aria-label={`Transcript ${index + 1}`} value={value} onChange={event => onChange(event.target.value)} disabled={disabled || fileBusy} placeholder="Paste the full questions and answers here…" rows={10} />}
    {fileProgress && <p role="status" className="document-progress">{fileProgress} {fileBusy && <button onClick={()=>importController.current?.abort()}>Cancel import</button>}</p>}
    {file?.extraction && <p className="document-progress">{file.extraction.pageCount} PDF pages retained. {file.extraction.pages.filter(p=>p.warning).length>0 && `Inspect sparse-text PDF pages for missing scanned testimony: ${file.extraction.pages.filter(p=>p.warning).map(p=>p.pdfPage).join(', ')}.`}</p>}
    {(file?.extraction?.ocrPages?.length>0 || file?.extraction?.failedPages?.length>0) && <p role="alert" className="error">Original saved. Pages requiring OCR or repair: {[...file.extraction.ocrPages,...file.extraction.failedPages].join(', ')}. Analysis is blocked until you upload the corrected PDF.</p>}
    {file?.pageMappingStale && <p role="alert" className="error">Text was edited after extraction. Re-upload the corrected PDF before analysis to restore page references.</p>}
    {file?.type === "application/pdf" && <p className="document-progress">Check the extracted text before analyzing: PDF reading order can vary.</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}

function Dashboard({ session }) {
  const [cases, setCases] = useState([]);
  const [activeId, setActiveId] = useState("sample");
  const [drafts, setDrafts] = useState(() => ({ sample: blankDraft(true) }));
  const [newCase, setNewCase] = useState(false);
  const [title, setTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [readingFile, setReadingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [documents] = useState(() => createDocumentStore(supabase, session.user.id));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saveLock = useRef(false);
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseError, setCaseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [analysisMode,setAnalysisMode]=useState("events");
  const [preparing, setPreparing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [reportError, setReportError] = useState("");
  const [analysisTiming, setAnalysisTiming] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showFeedback,setShowFeedback]=useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [store] = useState(() => createCaseStore(supabase));
  const request = useRef(null);
  const timer = useRef(null);
  const inFlight = useRef(false);
  const draft = drafts[activeId] ?? blankDraft();
  const caseTitle = activeId === "sample" ? "Marcus Webb" : cases.find(row => row.id === activeId)?.title ?? "Untitled case";
  const updateDraft = useCallback((id, values) => setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] ?? blankDraft()), ...values } })),[]);
  const apiFetch=useCallback(async(url,options={})=>{
    const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw new Error('Sign in again before analyzing.');
    return fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${data.session.access_token}`}});
  },[]);
  const patch = values => updateDraft(activeId, { ...values, dirty: true });
  const blocked = loading || preparing || Boolean(pendingPlan) || saving || opening || caseBusy || deleting || uploading || readingFile;

  useEffect(() => {
    if (!loading && !readingFile && !uploading && !Object.values(drafts).some(item => item.dirty)) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, uploading, readingFile, loading]);

  async function persist(id, snapshot) {
    await store.save(id, snapshot);
    updateDraft(id, { dirty: false });
    setSaveError("");
  }
  async function uploadOriginal(index, text, chosen, extraction, options) {
    if (loading || saving || opening || caseBusy || deleting || uploading || uploadLock.current) throw new Error("Please wait for the current action to finish.");
    if (activeId === "sample") throw new Error("Click Save sample as case before uploading an original file.");
    uploadLock.current = true; setUploading(true); setSaveError("");
    let uploaded;
    let committed = false;
    try {
      uploaded = await documents.upload(activeId, chosen, options);
      if(extraction) uploaded.extraction = extraction;
      options?.signal?.throwIfAborted();
      const texts = [...draft.texts], files = [...draft.files];
      const previous = files[index];
      texts[index] = text; files[index] = uploaded;
      const next = { ...draft, texts, files, results: null, seconds: null, analysis:null, notes: {}, reviewed: {}, selected: 0 };
      // Save text and its original-file reference together in one case update.
      await store.save(activeId, next);
      committed = true;
      updateDraft(activeId, { ...next, dirty: false });
      if (previous?.path) setCaseError("The replaced original was kept privately for older analysis recovery. Deleting this case removes its originals.");
    } catch (err) {
      if (uploaded && !committed) {
        try { await documents.remove(activeId, uploaded); }
        catch { setCaseError("An incomplete upload could not be cleaned up. Your previous case contents were kept."); }
      }
      throw err;
    } finally { uploadLock.current = false; setUploading(false); }
  }
  async function saveWork() {
    if (blocked || saveLock.current) return;
    saveLock.current = true; setSaving(true); setSaveError("");
    let id = activeId;
    try {
      if (id === "sample") {
        const row = await store.create("Marcus Webb");
        id = row.id;
        setCases(previous => [row, ...previous]);
        updateDraft(id, { ...draft, dirty: true });
        updateDraft("sample", { dirty: false });
        setActiveId(id);
      }
      await persist(id, draft);
    } catch (err) { setSaveError(`Save failed: ${err.message}. Your work is still in this tab. Retry Save case.`); }
    finally { saveLock.current = false; setSaving(false); }
  }

  useEffect(() => {
    let cancelled = false;
    store.list().then(rows => { if (!cancelled) setCases(previous => [...previous, ...rows.filter(row => !previous.some(existing => existing.id === row.id))]); }).catch(err => { if (!cancelled) setCaseError(err.message); });
    return () => { cancelled = true; request.current?.abort(); clearInterval(timer.current); };
  }, [store]);

  async function createCase(event) {
    event.preventDefault();
    if (blocked) return;
    setCaseBusy(true); setCaseError("");
    try {
      const row = await store.create(title);
      setCases(previous => [row, ...previous]);
      setDrafts(previous => ({ ...previous, [row.id]: blankDraft() }));
      setActiveId(row.id); setNewCase(false); setTitle(""); setFilter("ALL"); setError("");
    } catch (err) { setCaseError(err.message); }
    finally { setCaseBusy(false); }
  }
  async function selectCase(id) {
    if (blocked) return;
    setSaveError("");
    if (!drafts[id]) {
      setOpening(true); setCaseError("");
      try {
        const row = await store.get(id);
        updateDraft(id, {
          ...blankDraft(), texts: [row.transcript1 ?? "", row.transcript2 ?? ""],
          results: Array.isArray(row.results?.findings) ? row.results.findings : Array.isArray(row.results) ? row.results : null,
          seconds: row.results?.elapsedSeconds ?? null,
          notes: row.review_notes?.notes ?? {}, reviewed: row.review_notes?.reviewed ?? {},
          analysis: row.results?.analysis ?? null,
          files: [0,1].map(index => row.review_notes?.documents?.[index]?.path ? row.review_notes.documents[index] : null),
        });
      } catch (err) { setCaseError(`Could not open case: ${err.message}`); return; }
      finally { setOpening(false); }
    }
    setActiveId(id); setError(""); setFilter("ALL"); setCopyMessage("");
  }
  async function deleteCase() {
    if (!deleteTarget || blocked || deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setDeleteError("");
    try {
      const recovery=await recoveryRequest(apiFetch,`?caseId=${encodeURIComponent(deleteTarget.id)}`);
      for(const job of recovery.jobs)await recoveryRequest(apiFetch,`/${job.id}`,{method:'DELETE'});
      const eventJobs=await eventRecoveryRequest(apiFetch,`?caseId=${encodeURIComponent(deleteTarget.id)}`);
      for(const job of eventJobs.jobs)await eventRecoveryRequest(apiFetch,`/${job.id}`,{method:'DELETE'});
      await store.remove(deleteTarget.id);
      try { await documents.removeCaseFiles(deleteTarget.id); }
      catch { setCaseError("The case was deleted, but some original files could not be cleaned up. Storage cleanup needs to be retried."); }
      setCases(previous => previous.filter(row => row.id !== deleteTarget.id));
      setDrafts(previous => {
        const remaining = { ...previous };
        delete remaining[deleteTarget.id];
        return remaining;
      });
      setActiveId("sample"); setFilter("ALL"); setError(""); setSaveError(""); setCopyMessage("");
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(`Could not delete this case: ${err.message}. Your case has been kept. You can retry.`);
    } finally { deleteLock.current = false; setDeleting(false); }
  }
  async function signOut() {
    if (blocked) return;
    if (Object.values(drafts).some(item => item.dirty) && !window.confirm("Some changes have not been saved. Sign out and discard those changes?")) return;
    const { error: failure } = await supabase.auth.signOut();
    if (failure) setCaseError(failure.message);
  }
  async function prepareAnalysis(resumeJobId=null,recoveryRecord=null) {
    if(blocked || inFlight.current) return;
    if(activeId === "sample") { setError("Save this sample as a case before analyzing."); return; }
    setPreparing(true); setError("");
    const controller = new AbortController(); request.current = controller;
    try {
      const source=recoveryRecord?recoveredDraft(draft,recoveryRecord):draft;
      const body={...analysisBody(source.texts,source.files),caseId:activeId,originalDocuments:source.files.map(documentMetadata),...(resumeJobId?{resumeJobId}:{}),...(resumableCloudJobId(source.analysis)?{cloudJobId:resumableCloudJobId(source.analysis)}:{})};
      const plan=await previewAnalysis(body,{signal:controller.signal,fetchImpl:apiFetch});
      if(!Number.isInteger(plan.requestCount)||plan.requestCount<1||typeof plan.id!=="string")throw new Error("The server returned an invalid analysis plan.");
      setPendingPlan({plan,body,id:activeId,snapshot:source});
    } catch(err) {if(err.name !== "AbortError") setError(err.message);}
    finally {setPreparing(false);}
  }
  async function analyze() {
    if(inFlight.current || !pendingPlan) return;
    const {plan,body,id,snapshot:source}=pendingPlan; setPendingPlan(null); inFlight.current=true;
    const controller=new AbortController();request.current=controller;
    setAnalysisTiming(null);setLoading(true);setSaveError("");setError("");setElapsed(0);setFilter("ALL");
    setAnalysisProgress(`0 of ${plan.requestCount} comparisons completed`);
    const base=beginAnalysisDraft(source,plan.resuming);
    const start=performance.now();let latest=null,latestProgress=null,runStarted=false;
    timer.current=setInterval(()=>setElapsed(Math.floor((performance.now()-start)/1000)),1000);
    try {
      // Save complete source inputs before any paid call. Failed saves block analysis.
      await persist(id,source);controller.signal.throwIfAborted();
      updateDraft(id,{...base,results:base.results,analysis:{...base.analysis,status:"running",planned:plan.totalRequestCount??plan.requestCount,completed:(plan.totalRequestCount??plan.requestCount)-plan.requestCount,attempted:0,failed:0,partial:0},seconds:null,dirty:true});
      const data=await runAnalysis(body,plan,{signal:controller.signal,fetchImpl:apiFetch,onEvent:async event=>{
        if(event.event==='start'||event.event==='progress')runStarted=true;
        if(event.event === 'progress') {latestProgress=event;updateDraft(id,{analysis:event.analysis??{...(latest?.analysis ?? {status:'running',planned:plan.requestCount,failed:0}),completed:event.completed,attempted:event.attempted}});setAnalysisProgress(`${event.completed} of ${event.total} comparisons completed · request ${event.attempted}`);}
        if(event.event === 'checkpoint' || event.event === 'result') {
          latest=event;
          const processed=event.analysis.completed+event.analysis.failed+(event.analysis.partial??0);
          setAnalysisTiming({processed,processedThisRun:processed-((plan.totalRequestCount??plan.requestCount)-plan.requestCount),remaining:event.analysis.planned-processed,elapsed:(performance.now()-start)/1000});
          updateDraft(id,{results:event.contradictions,analysis:event.analysis,seconds:(performance.now()-start)/1000,dirty:true});
          setAnalysisProgress(`${event.analysis.completed} of ${event.analysis.planned} comparisons completed · ${event.analysis.failed} failed`);
          try{await persist(id,{...base,results:event.contradictions,analysis:event.analysis,seconds:(performance.now()-start)/1000});}
          catch(e){setSaveError(checkpointSaveWarning(e,event.analysis));}
        }
      }});
      const order={DIRECT:0,INFERENTIAL:1,FALSE_POSITIVE:2},severity={HIGH:0,MEDIUM:1,LOW:2};
      const sorted=[...data.contradictions].sort((a,b)=>(order[a.type]??3)-(order[b.type]??3)||(severity[a.severity]??3)-(severity[b.severity]??3));
      const completed={...recoveredDraft(base,{id:data.analysis.jobId,state:data.analysis.status,texts:source.texts,originalDocuments:source.files,result:{...data,contradictions:sorted}}),seconds:(performance.now()-start)/1000};
      updateDraft(id,{...completed,dirty:true});
      try{await persist(id,completed);}catch(err){setSaveError(`Results retained in this tab but not saved: ${err.message}. Click Save case.`);}
      if(data.analysis.status !== 'complete')setError(`Analysis ${data.analysis.status}. Review completed comparisons and failed sections; this is not a complete review.`);
    } catch(err) {
      if(!runStarted&&!latest){updateDraft(id,source);setError(`Analysis did not start: ${err.message}. Previous results and documents were kept.`);return;}
      const status=controller.signal.aborted?'cancelled':latest?'partial':'failed';
      const analysis={...(latest?.analysis??latestProgress?.analysis??{planned:plan.requestCount,completed:0,attempted:0,failed:0}),status,attempted:latestProgress?.attempted??latest?.analysis?.attempted??0,
        tasks:latest?.analysis?.tasks?.map(t=>['running','pending'].includes(t.status)?{...t,attempted:t.attempted||t.id===latestProgress?.task?.id,status:controller.signal.aborted?'cancelled':'not_attempted'}:t),
        interruption:err.message,notice:'Final completion was not received. In-flight provider work may still be billed.'};
      const partial={...recoveredDraft(base,{id:analysis.jobId,state:status,texts:source.texts,originalDocuments:source.files,result:{analysis,contradictions:latest?.contradictions??base.results??[]}}),seconds:(performance.now()-start)/1000};
      updateDraft(id,{...partial,dirty:true});
      try{await persist(id,partial);}catch(e){setSaveError(`Partial results are in this tab only: ${e.message}. Click Save case.`);}
      setError(`Analysis ${status}. ${latest?'Completed comparison results were retained.':'No new completed comparisons were received.'} ${controller.signal.aborted?'':err.message}`);
    } finally {clearInterval(timer.current);inFlight.current=false;setLoading(false);}
  }
  async function recoverAnalysis(record){
    if(record.caseId!==activeId)throw new Error('Recovery belongs to a different case.');
    if(draft.dirty&&!window.confirm('Replace the displayed work with the saved server checkpoint? Save your edits first if needed.'))throw new Error('Recovery cancelled.');
    const recovered=recoveredDraft(draft,record);updateDraft(activeId,recovered);await persist(activeId,recovered);
  }
  const findings = (draft.results ?? []).map((result, index) => ({ result, index }));
  const visible = findings.filter(({ result }) => filter === "ALL" || result.type === filter);
  const selected = visible.find(item => item.index === draft.selected) ?? visible[0];
  async function copySource() {
    try {
      await navigator.clipboard.writeText([caseTitle, ...[0,1].map(i => `Transcript ${i+1}: ${selected.result[`claim${i+1}`]?.original ?? ""}\nSources: ${JSON.stringify(selected.result.sourceReferences?.[`claim${i+1}`] ?? "Text reference unavailable (legacy)")}`)].join("\n\n"));
      setCopyMessage("Quotes copied with transcript and source references.");
    } catch { setCopyMessage("Could not access the clipboard. Select and copy the quotes manually."); }
  }
  return <div className="workspace">
    {deleteTarget && <DeleteCaseDialog title={deleteTarget.title} busy={deleting} error={deleteError} onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }} onDelete={deleteCase} />}
    <aside className="case-sidebar"><a className="workspace-brand" href="#"> <span className="brand-mark">D</span> Deposition</a><div className="sidebar-section-label">MY CASES</div><button className="new-case-button" disabled={blocked} onClick={() => setNewCase(!newCase)}>＋ New case</button>
      {newCase && <form className="new-case-form" onSubmit={createCase}><label>Case name<input autoFocus value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required /></label><button disabled={caseBusy || !title.trim()}>{caseBusy ? "Saving…" : "Create case"}</button></form>}
      <CaseList cases={cases} userId={session.user.id} activeId={activeId} disabled={blocked} onSelect={selectCase} />
      {caseError && <p className="sidebar-error" role="alert">{caseError}</p>}
      <div className="sidebar-footer"><div className="account-avatar">{session.user.email?.slice(0,2).toUpperCase()}</div><div><span className="account-email">{session.user.email}</span><button className="link-button" disabled={blocked} onClick={signOut}>Sign out</button></div></div>
    </aside>
    <main className="workspace-main"><header className="workspace-header"><div><span className="eyebrow">TESTIMONY REVIEW</span><div className="case-title"><h1>{caseTitle}</h1><span className="private-badge">♙ Private case</span></div><p>Deposition review</p></div><div className="case-save"><button disabled={blocked} onClick={()=>setShowFeedback(v=>!v)}>Review &amp; Improve</button><span className="storage-status" role="status">{opening ? "Opening case…" : uploading ? "Uploading original…" : saving ? "Saving…" : saveError ? "Save failed" : activeId === "sample" ? "Sample · not saved" : draft.dirty ? "Unsaved changes" : loading ? "Analyzing…" : "✓ Saved"}</span><button disabled={blocked || !draft.analysis && !Array.isArray(draft.results)} onClick={() => { try { openReviewReport({title:caseTitle,draft}); setReportError(""); } catch (err) { setReportError(err.message); } }}>Review report</button><button disabled={blocked} onClick={saveWork}>{saving ? "Saving…" : activeId === "sample" ? "Save sample as case" : "Save case"}</button>{activeId !== "sample" && <CaseActions disabled={blocked} onDelete={() => { setDeleteError(""); setDeleteTarget({ id: activeId, title: caseTitle }); }} />}</div></header>
      {showFeedback&&<FeedbackInbox client={supabase} userId={session.user.id} onClose={()=>setShowFeedback(false)}/>}
      {pendingPlan && <div role="dialog" aria-modal="true" aria-labelledby="analysis-plan-title" className="analysis-plan"><h2 id="analysis-plan-title">Review before paid analysis</h2><p>{pendingPlan.plan.documents.map((d,i)=>`Transcript ${i+1}: ${d.pageCount??'unknown'} PDF pages, ${d.sections} sections`).join(' · ')}</p><p><b>{pendingPlan.plan.requestCount} model request{pendingPlan.plan.requestCount===1?'':'s'}</b> · estimated US ${pendingPlan.plan.cost.estimated.toFixed(2)} · conservative budget US ${pendingPlan.plan.cost.conservativeBudget.toFixed(2)}</p><p>{pendingPlan.plan.cost.note}</p>{pendingPlan.plan.execution==='durable-steps'&&<label>Maximum spend for this review (US$)<input aria-label="Maximum review spend" disabled={pendingPlan.plan.budgetFixed} type="number" min="0.01" step="0.01" value={pendingPlan.plan.approvedBudgetUsd??pendingPlan.plan.cost.conservativeBudget} onChange={e=>setPendingPlan(old=>({...old,plan:{...old.plan,approvedBudgetUsd:Number(e.target.value)}}))}/><small>A lower cap can stop with partial coverage. Completed work is kept.</small></label>}<p>{pendingPlan.plan.resuming?"Only unfinished comparisons will run again. Previously completed comparisons are retained.":"Every section is compared across both documents, including differently ordered sections."} Cancelled or interrupted work may incur charges and produces incomplete results.</p><button onClick={()=>setPendingPlan(null)}>Go back — no paid calls</button><button className="analyze-button" onClick={analyze}>Start {pendingPlan.plan.requestCount} paid request{pendingPlan.plan.requestCount===1?'':'s'}</button></div>}
      <details className="workflow-options"><summary>Comparison options</summary><label>Review method<select value={analysisMode} disabled={blocked} onChange={e=>setAnalysisMode(e.target.value)}><option value="events">Read, then compare</option><option value="legacy">Direct comparison (previous method)</option></select></label></details>
      <AnalysisStatus analysis={draft.analysis} active={loading} elapsed={loading ? elapsed : draft.seconds} timing={analysisTiming} />
      {analysisMode==='legacy' && <RecoveryPanel caseId={activeId} disabled={blocked} fetchImpl={apiFetch} onRecover={recoverAnalysis} onResume={prepareAnalysis} cloudJobId={draft.analysis?.cloudJobId} onCloudRecover={async result=>{const next={...draft,results:result.contradictions,analysis:result.analysis,dirty:true};updateDraft(activeId,next);await persist(activeId,next);}} />}
      <section className={`documents-toolbar ${analysisMode==='events'?'documents-pair':''}`} aria-label="Transcript documents">{draft.texts.map((text,i) => <TranscriptFile key={`${activeId}-${i}`} index={i} value={text} file={draft.files[i]} disabled={blocked} onReadingChange={setReadingFile} onOpen={file => documents.download(activeId, file)} onChange={value => { const texts = [...draft.texts], files=[...draft.files]; texts[i] = value; if(files[i]?.extraction) files[i]={...files[i],pageMappingStale:true}; patch({ texts, files, results: null, seconds: null, analysis:null }); }} onFile={(text, chosen, extraction, options) => uploadOriginal(i, text, chosen, extraction, options)} />)}{analysisMode==='legacy'&&<div className="analyze-block">{analysisMode==='legacy' && <button className="analyze-button" disabled={blocked} onClick={()=>prepareAnalysis()}>{preparing ? "Preparing estimate…" : loading ? "Analyzing…" : "Review analysis cost"}</button>}<p role="status">{loading ? `◌ ${elapsed}s elapsed · ${analysisProgress}` : draft.seconds !== null ? `${draft.analysis?.status ?? (draft.results ? "Completed (legacy)" : "Request ended")} · ${draft.seconds.toFixed(1)} seconds` : "Ready when you are"}</p><small>Analysis sends these texts to Anthropic.</small>{analysisMode==='legacy' && (loading || preparing) && <button onClick={()=>request.current?.abort()}>Cancel analysis</button>}</div>}</section>
      {analysisMode==='events' && <EventReview key={activeId} caseId={activeId} draft={draft} fetchImpl={apiFetch} disabled={blocked&&!loading} onBusy={setLoading} onTick={setElapsed} onTiming={setAnalysisTiming} onPlanning={setPreparing} onCheckpoint={async snapshot=>{updateDraft(activeId,{...snapshot,dirty:true});await persist(activeId,snapshot);}}/>}
      <details className="workspace-help"><summary>Files, saving & practice samples</summary><p className="session-note">Transcripts and results save when you analyze. Click Save case after editing transcripts, notes or review marks. PDF and text originals save privately and reopen after refresh. PDFs need selectable text; scanned pages need OCR. Practice files: <a href="/examples/riley-morgan-first-deposition.pdf" download>First PDF</a> · <a href="/examples/riley-morgan-second-deposition.pdf" download>Second PDF</a> · <a href="/examples/expected-results.html" target="_blank" rel="noopener noreferrer">Expected results</a>.</p></details>
      {reportError && <p className="error" role="alert">{reportError}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <section className="review-layout" id="review-findings"><aside className="findings-panel"><div className="findings-heading"><h2>Findings</h2><span>{findings.length}</span></div><div className="finding-filters" aria-label="Filter findings">{[["ALL","All"],["DIRECT","Direct"],["INFERENTIAL","Inferential"],["FALSE_POSITIVE","False positive"]].map(([value,text]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setCopyMessage(""); }}>{text}</button>)}</div>
        {!draft.results && <div className="findings-empty"><span>⌕</span><h3>{loading ? "Review in progress" : "Start with two transcripts"}</h3><p>{loading ? "Findings will appear when analysis completes. Keep this tab open." : "Preview the text above, then analyze to compare the witness’s accounts."}</p></div>}
        {draft.results && visible.length === 0 && <p className="findings-empty">No findings in this category.</p>}
        <div className="finding-list">{visible.map(({result,index}) => <button key={index} className={`finding-item ${result.type.toLowerCase()} ${selected?.index === index ? "selected" : ""}`} onClick={() => { updateDraft(activeId, { selected: index }); setCopyMessage(""); }}><span className={`type-chip ${result.type.toLowerCase()}`}>{label(result.type)}</span>{draft.reviewed[index] && <span className="reviewed-label">✓ Reviewed</span>}<h3>{heading(result)}</h3><p>{result.reasoning?.slice(0,135)}{result.reasoning?.length > 135 ? "…" : ""}</p><span className="finding-arrow">›</span></button>)}</div>
      </aside><div className="finding-detail">{selected ? <><div className="detail-title"><span className="eyebrow">SELECTED FINDING</span><h2>{label(selected.result.type)} comparison</h2><p>Read both source quotes and review the reasoning below.</p><button className="link-button" onClick={copySource}>Copy quotes with source ↗</button>{copyMessage && <small role="status">{copyMessage}</small>}</div><ReviewCard result={selected.result} dismissed={selected.result.type === "FALSE_POSITIVE"} /><CorrectionForm key={`${activeId}-${selected.index}-${selected.result.type}-${selected.result.claim1?.original}-${selected.result.claim2?.original}`} client={supabase} caseId={activeId} finding={selected.result} findingIndex={selected.index} disabled={blocked} saved={activeId!=="sample"&&!draft.dirty} /><div className="review-note"><label htmlFor="review-note">Your review note <span>· click Save case to keep changes</span></label><textarea id="review-note" disabled={blocked} rows={2} value={draft.notes[selected.index] ?? ""} onChange={event => patch({ notes: { ...draft.notes, [selected.index]: event.target.value } })} placeholder="Add a review note…" /><button disabled={blocked} onClick={() => patch({ reviewed: { ...draft.reviewed, [selected.index]: !draft.reviewed[selected.index] } })}>{draft.reviewed[selected.index] ? "✓ Reviewed · undo" : "Mark reviewed"}</button></div></> : <div className="detail-empty"><div className="empty-document">≋</div><span className="eyebrow">THE FULL PICTURE</span><h2>Two accounts.<br/>One clear workspace.</h2><p>Select a finding to see the source quotes, AI explanation and independent code verification together.</p><div className="empty-steps"><span>01 &nbsp; Add testimony</span><span>02 &nbsp; Compare accounts</span><span>03 &nbsp; Review evidence</span></div></div>}<ScoreGuide /></div></section>
    </main>
  </div>;
}
export default function App() {
  return <AuthGate>{session => <Dashboard key={session.user.id} session={session} />}</AuthGate>;
}
