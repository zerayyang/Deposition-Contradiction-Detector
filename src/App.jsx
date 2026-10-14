import { useEffect, useRef, useState } from "react";
import AuthGate from "./SupabaseCases.jsx";
import { supabase } from "./lib/supabaseClient.js";
import { readTranscript } from "./lib/readTranscript.js";
import { createDocumentStore } from "./lib/documentStore.js";
import { createCaseStore } from "./lib/caseStore.js";
import { ReviewCard, ScoreGuide } from "./ReviewCard.jsx";
import { TRANSCRIPT_1, TRANSCRIPT_2 } from "./sampleTranscripts.js";
import CaseList from "./CaseList.jsx";
import { CaseActions, DeleteCaseDialog } from "./CaseActions.jsx";
import "./workspace.css";

const label = type => ({ DIRECT: "Direct", INFERENTIAL: "Inferential", FALSE_POSITIVE: "False positive" }[type] ?? "Finding");
const blankDraft = (sample = false) => ({ texts: sample ? [TRANSCRIPT_1, TRANSCRIPT_2] : ["", ""], files: [null, null], results: null, seconds: null, selected: 0, reviewed: {}, notes: {}, dirty: false });
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
  async function readFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError("");
    if (chosen.size > 2 * 1024 * 1024) { setError("Choose a PDF or text file smaller than 2 MB."); return; }
    if (!/\.(pdf|txt|md)$/i.test(chosen.name)) { setError("Choose a .pdf, .txt or .md transcript."); return; }
    setFileBusy(true); onReadingChange(true); setFileProgress("Reading file…");
    try { const text = await readTranscript(chosen, setFileProgress); setFileProgress("Saving original…"); await onFile(text, chosen); setPreview(true); }
    catch (err) { setError(err.message || "This file could not be saved. Try uploading again."); }
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
    <div className="document-actions"><button className="link-button" aria-expanded={preview} aria-controls={`transcript-text-${index}`} onClick={() => setPreview(!preview)}>{preview ? "Hide text" : "Show text"}</button><button className="link-button" disabled={!file} onClick={openOriginal}>Open original ↗</button><span className="document-formats">PDF, TXT, MD · up to 2 MB</span></div>
    <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={readFile} hidden disabled={disabled || fileBusy} />
    {preview && <textarea id={`transcript-text-${index}`} aria-label={`Transcript ${index + 1}`} value={value} onChange={event => onChange(event.target.value)} disabled={disabled || fileBusy} placeholder="Paste the full questions and answers here…" rows={10} />}
    {fileProgress && <p role="status" className="document-progress">{fileProgress}</p>}
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
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [copyMessage, setCopyMessage] = useState("");
  const [store] = useState(() => createCaseStore(supabase));
  const request = useRef(null);
  const timer = useRef(null);
  const inFlight = useRef(false);
  const draft = drafts[activeId] ?? blankDraft();
  const caseTitle = activeId === "sample" ? "Marcus Webb" : cases.find(row => row.id === activeId)?.title ?? "Untitled case";
  const updateDraft = (id, values) => setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] ?? blankDraft()), ...values } }));
  const patch = values => updateDraft(activeId, { ...values, dirty: true });
  const blocked = loading || saving || opening || caseBusy || deleting || uploading || readingFile;

  useEffect(() => {
    if (!readingFile && !uploading && !Object.values(drafts).some(item => item.dirty)) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, uploading, readingFile]);

  async function persist(id, snapshot) {
    await store.save(id, snapshot);
    updateDraft(id, { dirty: false });
  }
  async function uploadOriginal(index, text, chosen) {
    if (loading || saving || opening || caseBusy || deleting || uploading || uploadLock.current) throw new Error("Please wait for the current action to finish.");
    if (activeId === "sample") throw new Error("Click Save sample as case before uploading an original file.");
    uploadLock.current = true; setUploading(true); setSaveError("");
    let uploaded;
    let committed = false;
    try {
      uploaded = await documents.upload(activeId, chosen);
      const texts = [...draft.texts], files = [...draft.files];
      const previous = files[index];
      texts[index] = text; files[index] = uploaded;
      const next = { ...draft, texts, files, results: null, seconds: null, notes: {}, reviewed: {}, selected: 0 };
      // Save text and its original-file reference together in one case update.
      await store.save(activeId, next);
      committed = true;
      updateDraft(activeId, { ...next, dirty: false });
      if (previous?.path) {
        try { await documents.remove(activeId, previous); }
        catch { setCaseError("The new file is saved. Its older original could not be cleaned up; deleting this case will retry cleanup."); }
      }
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
  async function analyze() {
    if (inFlight.current || blocked) return;
    if (activeId === "sample") { setError("Click Save sample as case first, then analyze your saved case."); return; }
    if (draft.texts.some(text => !text.trim())) { setError("Add both transcripts before analyzing."); return; }
    inFlight.current = true;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setSaveError(""); setError(""); setElapsed(0); setFilter("ALL");
    patch({ results: null, seconds: null, selected: 0, reviewed: {}, notes: {}, dirty: false });
    const start = performance.now();
    let analysisCompleted = false;
    timer.current = setInterval(() => setElapsed(Math.floor((performance.now() - start) / 1000)), 1000);
    try {
      // Persist the input before sending it to the AI. If saving fails, do not start analysis.
      await persist(activeId, { ...draft, results: null, seconds: null, reviewed: {}, notes: {} });
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ transcript1: draft.texts[0], transcript2: draft.texts[1] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Analysis request failed.");
      if (!Array.isArray(data.contradictions)) throw new Error("The server returned an invalid result.");
      const order = { DIRECT: 0, INFERENTIAL: 1, FALSE_POSITIVE: 2 };
      const severity = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const completed = { ...draft, results: [...data.contradictions].sort((a,b) => (order[a.type] ?? 3) - (order[b.type] ?? 3) || (severity[a.severity] ?? 3) - (severity[b.severity] ?? 3)), seconds: (performance.now() - start) / 1000, reviewed: {}, notes: {}, selected: 0 };
      analysisCompleted = true;
      updateDraft(activeId, { ...completed, dirty: true });
      try { await persist(activeId, completed); }
      catch (err) { setSaveError(`Results are ready but were not saved: ${err.message}. Click Save case to retry.`); }
    } catch (err) { if (err.name !== "AbortError") setError(err.message ?? "Analysis failed. Your text remains here so you can retry."); }
    finally {
      clearInterval(timer.current); inFlight.current = false;
      if (!controller.signal.aborted) {
        if (!analysisCompleted) updateDraft(activeId, { seconds: (performance.now() - start) / 1000 });
        setLoading(false);
      }
    }
  }
  const findings = (draft.results ?? []).map((result, index) => ({ result, index }));
  const visible = findings.filter(({ result }) => filter === "ALL" || result.type === filter);
  const selected = visible.find(item => item.index === draft.selected) ?? visible[0];
  async function copySource() {
    try {
      await navigator.clipboard.writeText([caseTitle, ...[0,1].map(i => `Transcript ${i+1}: ${selected.result[`claim${i+1}`]?.original ?? ""}`)].join("\n\n"));
      setCopyMessage("Quotes copied with transcript labels.");
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
    <main className="workspace-main"><header className="workspace-header"><div><span className="eyebrow">TESTIMONY REVIEW</span><div className="case-title"><h1>{caseTitle}</h1><span className="private-badge">♙ Private case</span></div><p>Deposition review</p></div><div className="case-save"><span className="storage-status" role="status">{opening ? "Opening case…" : uploading ? "Uploading original…" : saving ? "Saving…" : saveError ? "Save failed" : activeId === "sample" ? "Sample · not saved" : draft.dirty ? "Unsaved changes" : loading ? "Analyzing…" : "✓ Saved"}</span><button disabled={blocked} onClick={saveWork}>{saving ? "Saving…" : activeId === "sample" ? "Save sample as case" : "Save case"}</button>{activeId !== "sample" && <CaseActions disabled={blocked} onDelete={() => { setDeleteError(""); setDeleteTarget({ id: activeId, title: caseTitle }); }} />}</div></header>
      <section className="documents-toolbar" aria-label="Transcript documents">{draft.texts.map((text,i) => <TranscriptFile key={`${activeId}-${i}`} index={i} value={text} file={draft.files[i]} disabled={blocked} onReadingChange={setReadingFile} onOpen={file => documents.download(activeId, file)} onChange={value => { const texts = [...draft.texts]; texts[i] = value; patch({ texts, results: null, seconds: null }); }} onFile={(text, chosen) => uploadOriginal(i, text, chosen)} />)}<div className="analyze-block"><button className="analyze-button" disabled={blocked} onClick={analyze}>{loading ? "Analyzing…" : "Analyze transcripts"}</button><p role="status">{loading ? `◌ ${elapsed}s elapsed` : draft.seconds !== null ? `${draft.results ? "● Completed" : "Request ended"} · ${draft.seconds.toFixed(1)} seconds` : "Ready when you are"}</p><small>Analysis sends these texts to Anthropic.</small></div></section>
      <p className="session-note">Transcripts and results save when you analyze. Click Save case after editing transcripts, notes or review marks. PDF and text originals save privately and reopen after refresh. PDFs need selectable text; scanned pages need OCR. Try the fictional samples: <a href="/examples/riley-morgan-first-deposition.pdf" download>First PDF</a> · <a href="/examples/riley-morgan-second-deposition.pdf" download>Second PDF</a> · <a href="/examples/expected-results.html" target="_blank" rel="noopener noreferrer">Expected results</a>.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <section className="review-layout"><aside className="findings-panel"><div className="findings-heading"><h2>Findings</h2><span>{findings.length}</span></div><div className="finding-filters" aria-label="Filter findings">{[["ALL","All"],["DIRECT","Direct"],["INFERENTIAL","Inferential"],["FALSE_POSITIVE","False positive"]].map(([value,text]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setCopyMessage(""); }}>{text}</button>)}</div>
        {!draft.results && <div className="findings-empty"><span>⌕</span><h3>{loading ? "Review in progress" : "Start with two transcripts"}</h3><p>{loading ? "Findings will appear when analysis completes. Keep this tab open." : "Preview the text above, then analyze to compare the witness’s accounts."}</p></div>}
        {draft.results && visible.length === 0 && <p className="findings-empty">No findings in this category.</p>}
        <div className="finding-list">{visible.map(({result,index}) => <button key={index} className={`finding-item ${result.type.toLowerCase()} ${selected?.index === index ? "selected" : ""}`} onClick={() => { updateDraft(activeId, { selected: index }); setCopyMessage(""); }}><span className={`type-chip ${result.type.toLowerCase()}`}>{label(result.type)}</span>{draft.reviewed[index] && <span className="reviewed-label">✓ Reviewed</span>}<h3>{heading(result)}</h3><p>{result.reasoning?.slice(0,135)}{result.reasoning?.length > 135 ? "…" : ""}</p><span className="finding-arrow">›</span></button>)}</div>
      </aside><div className="finding-detail">{selected ? <><div className="detail-title"><span className="eyebrow">SELECTED FINDING</span><h2>{label(selected.result.type)} comparison</h2><p>Read both source quotes and review the reasoning below.</p><button className="link-button" onClick={copySource}>Copy quotes with source ↗</button>{copyMessage && <small role="status">{copyMessage}</small>}</div><ReviewCard result={selected.result} dismissed={selected.result.type === "FALSE_POSITIVE"} /><div className="review-note"><label htmlFor="review-note">Your review note <span>· click Save case to keep changes</span></label><textarea id="review-note" disabled={blocked} rows={2} value={draft.notes[selected.index] ?? ""} onChange={event => patch({ notes: { ...draft.notes, [selected.index]: event.target.value } })} placeholder="Add a review note…" /><button disabled={blocked} onClick={() => patch({ reviewed: { ...draft.reviewed, [selected.index]: !draft.reviewed[selected.index] } })}>{draft.reviewed[selected.index] ? "✓ Reviewed · undo" : "Mark reviewed"}</button></div></> : <div className="detail-empty"><div className="empty-document">≋</div><span className="eyebrow">THE FULL PICTURE</span><h2>Two accounts.<br/>One clear workspace.</h2><p>Select a finding to see the source quotes, AI explanation and independent code verification together.</p><div className="empty-steps"><span>01 &nbsp; Add testimony</span><span>02 &nbsp; Compare accounts</span><span>03 &nbsp; Review evidence</span></div></div>}<ScoreGuide /></div></section>
    </main>
  </div>;
}
export default function App() {
  return <AuthGate>{session => <Dashboard key={session.user.id} session={session} />}</AuthGate>;
}
