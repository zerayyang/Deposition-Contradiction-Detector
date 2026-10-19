// PDF report: a print-ready page built from the saved findings. The person picks what to
// include first (ReportSheet); the browser's print dialog then saves it as a PDF.
import { findingTitle, shortRule, firstSentence, askQuestion } from "./shortLabels.js";
import { scoreBadge } from "./scoreBadge.js";
import { hybridBadge } from "../../shared/hybridConfidence.js";

export const REPORT_SCOPES = Object.freeze([
  { id: "contradictions", label: "All contradictions", hint: "Direct, inferential and uncertain", kinds: ["DIRECT", "INFERENTIAL", "UNCERTAIN"] },
  { id: "direct", label: "Direct only", hint: "Statements that flatly conflict", kinds: ["DIRECT"] },
  { id: "inferential", label: "Inferential only", hint: "Conflicts that need a step of reasoning", kinds: ["INFERENTIAL"] },
  { id: "uncertain", label: "Uncertain only", hint: "Two reads disagreed; needs a person", kinds: ["UNCERTAIN"] },
  { id: "dismissed", label: "Not contradictions only", hint: "Pairs checked and found compatible", kinds: ["FALSE_POSITIVE"] },
  { id: "everything", label: "Everything", hint: "Every finding, grouped by type", kinds: ["DIRECT", "INFERENTIAL", "UNCERTAIN", "FALSE_POSITIVE"] },
]);
const KIND_NAMES = { DIRECT: "Direct", INFERENTIAL: "Inferential", UNCERTAIN: "Uncertain", FALSE_POSITIVE: "Not a contradiction" };
const RANK = { DIRECT: 0, INFERENTIAL: 1, UNCERTAIN: 2, FALSE_POSITIVE: 3 };

// Uncertain (two reads disagree) and older "needs review" findings are one group.
export const reportKind = f => f?.labelDisagreement || f?.type === "NEEDS_REVIEW" ? "UNCERTAIN" : f?.type ?? "FALSE_POSITIVE";
export function reportCounts(findings = []) {
  const counts = { DIRECT: 0, INFERENTIAL: 0, UNCERTAIN: 0, FALSE_POSITIVE: 0 };
  for (const f of findings) counts[reportKind(f)] = (counts[reportKind(f)] ?? 0) + 1;
  return counts;
}
export function reportSelection(findings = [], scopeId = "contradictions") {
  const scope = REPORT_SCOPES.find(s => s.id === scopeId) ?? REPORT_SCOPES[0];
  return findings.map((f, index) => ({ f, index, kind: reportKind(f) }))
    .filter(x => scope.kinds.includes(x.kind))
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.f.humanConfidence ?? -1) - (a.f.humanConfidence ?? -1) || a.index - b.index);
}

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pages = (f, key) => [...new Set((f.sourceReferences?.[key] ?? []).map(r => r.pageLabel || r.pdfPage).filter(Boolean))];
function badge(f) {
  const hybrid = hybridBadge(f);
  return hybrid.kind !== "none" ? hybrid : scoreBadge(f);
}
function card({ f, index, kind }, n, options, draft) {
  const quotes = ["claim1", "claim2"].map((key, i) => {
    const where = pages(f, key);
    return `<figure><figcaption>Transcript ${i + 1}${where.length ? ` · Page ${escape(where.join(", "))}` : ""}</figcaption><blockquote>“${escape(f[key]?.original ?? "Quote unavailable")}”</blockquote></figure>`;
  }).join("");
  const reasoning = String(f.reasoning ?? "").replace(/(?:neutral\s+|possible\s+)?follow[- ]up(?:\s+question)?\s*:[\s\S]*$/i, "").trim();
  const explanation = options.fullExplanations ? reasoning : firstSentence(reasoning, 600);
  const ask = askQuestion(f.reasoning);
  const note = String(draft.notes?.[index] ?? "").trim();
  const score = badge(f), rule = shortRule(f.typeRule);
  return `<article class="card ${kind.toLowerCase()}">
  <header><span class="num">${n}</span><div class="head"><h3>${escape(findingTitle(f))}</h3>${rule ? `<p class="rule">${escape(rule)}</p>` : ""}</div>
  <div class="tags"><span class="pill ${kind.toLowerCase()}">${KIND_NAMES[kind]}</span><span class="score">${escape(score.value)}</span></div></header>
  <div class="quotes">${quotes}</div>
  ${explanation ? `<p class="why">${escape(explanation)}</p>` : ""}
  ${ask ? `<p class="ask"><b>Ask</b> ${escape(ask)}</p>` : ""}
  ${kind === "UNCERTAIN" && f.consistency?.agreed === false ? `<p class="note">First read: ${KIND_NAMES[f.consistency.firstType] ?? f.consistency.firstType} · Second read: ${KIND_NAMES[f.consistency.secondType] ?? f.consistency.secondType}</p>` : ""}
  ${options.notes && (note || draft.reviewed?.[index]) ? `<p class="note">${draft.reviewed?.[index] ? "<b>✓ Reviewed</b>" : ""}${note ? `${draft.reviewed?.[index] ? " · " : ""}<b>Note</b> ${escape(note)}` : ""}</p>` : ""}
</article>`;
}

export function buildPdfReport({ title = "Untitled case", draft = {}, options = {}, generatedAt = new Date() } = {}) {
  const opts = { scope: "contradictions", notes: true, fullExplanations: false, ...options };
  const findings = Array.isArray(draft.results) ? draft.results : [];
  const counts = reportCounts(findings), selected = reportSelection(findings, opts.scope);
  const scope = REPORT_SCOPES.find(s => s.id === opts.scope) ?? REPORT_SCOPES[0];
  const found = counts.DIRECT + counts.INFERENTIAL;
  const files = (draft.files ?? []).map((file, i) => file ? `Transcript ${i + 1}: ${escape(file.name)}${file.extraction?.pageCount ? ` (${file.extraction.pageCount} pages)` : ""}` : `Transcript ${i + 1}: pasted text`).join(" · ");
  const date = new Date(generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  let groups = "", n = 0;
  for (const kind of ["DIRECT", "INFERENTIAL", "UNCERTAIN", "FALSE_POSITIVE"]) {
    const items = selected.filter(x => x.kind === kind);
    if (!items.length) continue;
    groups += `<section class="group"><h2>${KIND_NAMES[kind] === "Not a contradiction" ? "Not contradictions" : KIND_NAMES[kind]} <span>${items.length}</span></h2>${items.map(x => card(x, ++n, opts, draft)).join("")}</section>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} — Contradiction Report</title><style>
@page{size:letter;margin:14mm 14mm 16mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:#1d1d1f;font:13px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:8px 0 24px}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#86868b;margin:0}
h1{font:700 30px/1.15 -apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;letter-spacing:-.02em;margin:6px 0 6px}
.meta{color:#6e6e73;margin:0}
.summary{display:grid;grid-template-columns:1.3fr repeat(4,1fr);gap:10px;margin:22px 0 10px}
.hero,.stat{border-radius:14px;padding:14px 16px}
/* Same tile colors as the app's summary strip. */
.hero{background:linear-gradient(135deg,rgba(248,250,252,.94),rgba(231,238,243,.7));color:#263844;border:1px solid rgba(190,204,215,.6)}
.hero b{display:block;font:700 36px/1 -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;letter-spacing:-.02em}
.hero span{font-size:13px;font-weight:600;color:#263844}
.stat{--tile-rgb:116 135 151;background:linear-gradient(135deg,rgba(255,255,255,.95),rgb(var(--tile-rgb)/.09));border:1px solid rgb(var(--tile-rgb)/.22)}
.stat b{display:block;font:600 26px/1.1 -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}
.stat span{font-size:11px;font-weight:600;color:#5d6f80}
.stat.direct{--tile-rgb:190 60 61}.stat.inferential{--tile-rgb:181 118 39}.stat.uncertain{--tile-rgb:175 144 37}.stat.false_positive{--tile-rgb:116 135 151}
.stat.direct b{color:#b42318}.stat.inferential b{color:#a0640c}.stat.uncertain b{color:#9a6400}.stat.false_positive b{color:#7a8794}
.showing{color:#6e6e73;margin:0 0 6px}
.group h2{font:600 17px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #d2d2d7}
.group h2 span{color:#86868b;font-weight:500}
.card{break-inside:avoid;border:1px solid #e5e5ea;border-radius:14px;padding:14px 16px;margin:0 0 10px;background:#fff}
.card header{display:flex;gap:12px;align-items:flex-start}
.num{flex:none;width:24px;height:24px;border-radius:50%;background:#f5f5f7;color:#1d1d1f;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center}
.head{flex:1;min-width:0}
h3{font-size:15px;font-weight:600;margin:1px 0 0;letter-spacing:-.01em}
.rule{color:#6e6e73;margin:1px 0 0;font-size:12px}
.tags{display:flex;gap:6px;align-items:center;flex:none}
.pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px}
.pill.direct{background:#ffeded;color:#a03434}.pill.inferential{background:#fff4dc;color:#8f6416}.pill.uncertain{background:#fff1cc;color:#7a4b00}.pill.false_positive{background:#edf1f4;color:#566878}
.score{font-size:12px;font-weight:600;color:#1d1d1f;background:#f5f5f7;border-radius:8px;padding:3px 8px}
.quotes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 0}
figure{margin:0;background:#f5f5f7;border-radius:10px;padding:10px 12px}
figcaption{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#86868b}
blockquote{margin:4px 0 0;font:15px/1.45 "New York","Iowan Old Style",Georgia,serif;color:#1d1d1f}
.why{margin:10px 0 0;color:#3a3a3c}
.ask{margin:8px 0 0;color:#0066cc}.ask b{color:#1d1d1f;margin-right:4px}
.note{margin:8px 0 0;color:#3a3a3c;font-size:12px}
.empty{color:#6e6e73;padding:24px;text-align:center;background:#f5f5f7;border-radius:14px}
footer{margin-top:22px;padding-top:10px;border-top:1px solid #d2d2d7;color:#86868b;font-size:11px}
</style></head><body><main>
<p class="eyebrow">Contradiction report · ${escape(date)}</p>
<h1>${escape(title)}</h1>
<p class="meta">${files}</p>
<section class="summary">
<div class="hero"><b>${found}</b><span>contradiction${found === 1 ? "" : "s"} found</span></div>
${["DIRECT", "INFERENTIAL", "UNCERTAIN", "FALSE_POSITIVE"].map(k => `<div class="stat ${k.toLowerCase()}"><b>${counts[k]}</b><span>${k === "FALSE_POSITIVE" ? "Not contradictions" : KIND_NAMES[k]}</span></div>`).join("")}
</section>
<p class="showing">This report shows: <b>${escape(scope.label)}</b> (${selected.length})</p>
${groups || `<p class="empty">No findings of this kind in this case.</p>`}
<footer>AI-assisted review. Check each quote against the original transcript before relying on it.</footer>
</main></body></html>`;
}

// Prints through a hidden frame, so no pop-up window is needed. Choose "Save as PDF" in the dialog.
export function printPdfReport(html, doc = document) {
  const frame = doc.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  doc.body.appendChild(frame);
  const win = frame.contentWindow;
  win.document.open(); win.document.write(html); win.document.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => { win.focus(); win.print(); }, 150);
  setTimeout(() => frame.isConnected && frame.remove(), 120000);
}
