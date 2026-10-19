import { useEffect, useRef, useState } from "react";
import { REPORT_SCOPES, reportCounts, reportSelection } from "./lib/pdfReport.js";
import "./reportSheet.css";

// Asks what to include before the PDF is made: which findings, plus notes and explanations.
export default function ReportSheet({ findings, onCancel, onExport }) {
  const [scope, setScope] = useState("contradictions");
  const [notes, setNotes] = useState(true);
  const [fullExplanations, setFullExplanations] = useState(false);
  const counts = reportCounts(findings), first = useRef(null);
  const countFor = id => reportSelection(findings, id).length;
  const chosen = countFor(scope);
  useEffect(() => {
    first.current?.focus();
    const close = event => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel]);
  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header className="sheet-header">
        <h2 id="sheet-title">Export PDF</h2>
        <p>{counts.DIRECT + counts.INFERENTIAL} contradictions found · {findings.length} findings in total</p>
      </header>
      <p className="sheet-label">Include</p>
      <div className="sheet-group" role="radiogroup" aria-label="Findings to include">
        {REPORT_SCOPES.map((option, i) => <button key={option.id} ref={i === 0 ? first : null} role="radio" aria-checked={scope === option.id}
          className="sheet-row" onClick={() => setScope(option.id)}>
          <span className="sheet-row-text"><b>{option.label}</b><small>{option.hint}</small></span>
          <span className="sheet-count">{countFor(option.id)}</span>
          <span className="sheet-check" aria-hidden="true">{scope === option.id ? "✓" : ""}</span>
        </button>)}
      </div>
      <p className="sheet-label">Options</p>
      <div className="sheet-group">
        <label className="sheet-row sheet-toggle"><span className="sheet-row-text"><b>Your notes</b><small>Review notes and reviewed marks</small></span>
          <input type="checkbox" role="switch" checked={notes} onChange={event => setNotes(event.target.checked)} /></label>
        <label className="sheet-row sheet-toggle"><span className="sheet-row-text"><b>Full explanations</b><small>Otherwise one sentence per finding</small></span>
          <input type="checkbox" role="switch" checked={fullExplanations} onChange={event => setFullExplanations(event.target.checked)} /></label>
      </div>
      {chosen === 0 && <p className="sheet-empty">Nothing of this kind in this case. Pick another option.</p>}
      <footer className="sheet-actions">
        <button className="sheet-button secondary" onClick={onCancel}>Cancel</button>
        <button className="sheet-button primary" disabled={chosen === 0} onClick={() => onExport({ scope, notes, fullExplanations })}>Export {chosen} finding{chosen === 1 ? "" : "s"}</button>
      </footer>
      <p className="sheet-hint">In the print window, choose “Save as PDF”.</p>
    </div>
  </div>;
}
