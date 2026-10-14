import { useEffect, useRef } from "react";

function TrashIcon() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>;
}

export function CaseActions({ disabled, onDelete }) {
  const menu = useRef(null);
  useEffect(() => {
    const close = event => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !menu.current?.contains(event.target))) {
        if (menu.current) menu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details className="case-actions-menu" ref={menu}>
    <summary aria-label="Case actions" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><span aria-hidden="true">•••</span></summary>
    <div className="case-actions-popover"><button disabled={disabled} onClick={() => { menu.current.open = false; onDelete(); }}><TrashIcon />Delete case…</button></div>
  </details>;
}

export function DeleteCaseDialog({ title, busy, error, onCancel, onDelete }) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    cancel.current.focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="delete-case-dialog" aria-labelledby="delete-case-title" aria-describedby="delete-case-description" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="delete-dialog-icon"><TrashIcon /></div>
    <h2 id="delete-case-title">Delete “{title}”?</h2>
    <p id="delete-case-description">This permanently deletes this case and its saved transcripts, original files, findings and review notes. This cannot be undone.</p>
    {error && <p className="delete-dialog-error" role="alert">{error}</p>}
    <div className="delete-dialog-buttons"><button ref={cancel} className="delete-cancel" disabled={busy} onClick={onCancel}>Cancel</button><button className="delete-confirm" disabled={busy} onClick={onDelete}>{busy ? "Deleting…" : "Delete case"}</button></div>
  </dialog>;
}
