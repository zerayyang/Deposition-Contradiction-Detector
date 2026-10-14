import { useRef, useState } from "react";
import { arrangeCases, swapCases } from "./lib/caseOrder.js";

export default function CaseList({ cases, userId, activeId, disabled, onSelect }) {
  const storageKey = `deposition:case-order:${userId}`;
  const [order, setOrder] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
    } catch { return []; }
  });
  const [drag, setDrag] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const rows = arrangeCases([{ id: "sample", title: "Marcus Webb", sample: true }, ...cases], order);

  function commit(source, target) {
    if (disabled || source === target) return;
    const next = swapCases(rows, source, target);
    if (next === rows) return;
    const ids = next.map(row => row.id);
    setOrder(ids);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
      setAnnouncement("Case positions swapped. Order remembered in this browser.");
    } catch { setAnnouncement("Cases swapped. Browser storage is unavailable; this order will reset after refresh."); }
  }
  function cancelDrag() {
    if (gesture.current?.moving) suppressClick.current = true;
    gesture.current = null; setDrag(null);
  }
  function pointerDown(event, row) {
    if (disabled || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    suppressClick.current = false;
    gesture.current = { id: row.id, title: row.title, sample: row.sample, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, width: bounds.width, moving: false, target: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const current = gesture.current;
    if (!current || disabled) return;
    if (!current.moving && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.moving = true;
    event.preventDefault();
    const nav = event.currentTarget.closest("nav");
    const bounds = nav.getBoundingClientRect();
    if (event.clientY < bounds.top + 24) nav.scrollTop -= 12;
    if (event.clientY > bounds.bottom - 24) nav.scrollTop += 12;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-case-id]");
    current.target = target && nav.contains(target) && target.dataset.caseId !== current.id ? target.dataset.caseId : null;
    setDrag({ ...current, x: event.clientX - current.offsetX, y: event.clientY - current.offsetY });
  }
  function pointerUp() {
    const current = gesture.current;
    if (current?.moving) {
      suppressClick.current = true;
      if (current.target) commit(current.id, current.target);
    }
    gesture.current = null; setDrag(null);
  }
  function keyDown(event, index) {
    if (event.key === "Escape") { cancelDrag(); return; }
    if (disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const destination = index + (event.key === "ArrowUp" ? -1 : 1);
    if (destination >= 0 && destination < rows.length) commit(rows[index].id, rows[destination].id);
  }
  return <>
    <span id="case-sort-help" className="visually-hidden">Drag a case onto another to swap their positions. Use up and down arrow keys to swap with a neighboring case. Escape cancels a drag.</span>
    <nav aria-label="Cases" className="sortable-cases">{rows.map((row, index) => <div key={row.id} data-case-id={row.id} className={`case-sort-row ${drag?.id === row.id ? "is-dragging" : ""} ${drag?.target === row.id ? "swap-target" : ""}`}>
      <button className={`case-link case-swap-button ${activeId === row.id ? "active" : ""}`} disabled={disabled} draggable={false} aria-describedby="case-sort-help" title="Drag onto another case to swap positions"
        onDragStart={event => event.preventDefault()}
        onPointerDown={event => pointerDown(event, row)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
        onKeyDown={event => keyDown(event, index)}
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect(row.id); }}>
        <span aria-hidden="true">▱</span><span>{row.title}{row.sample && <small>Sample case</small>}</span>
      </button>
      {drag?.target === row.id && <span className="swap-target-label" aria-hidden="true">Release to swap ↕</span>}
    </div>)}</nav>
    {drag && <div className="case-swap-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y, width: drag.width }}><span>▱</span><div>{drag.title}{drag.sample && <small>Sample case</small>}</div></div>}
    <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
  </>;
}
