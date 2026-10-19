import {readingHasGaps} from '../../shared/readingState.js';
import {hybridBadge} from '../../shared/hybridConfidence.js';
import {firstSentence} from './shortLabels.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=value=>Array.isArray(value)?value:[];
const names={DIRECT:'Direct',INFERENTIAL:'Inferential',NEEDS_REVIEW:'Needs review'};
function source(f,key){
  const refs=list(f.sourceReferences?.[key]);
  if(refs.length)return refs.map(r=>r.pdfPage?`PDF page ${r.pdfPage}${r.pageLabel?` · printed ${r.pageLabel}`:''}`:`Text characters ${r.start}–${r.end}`).map(escape).join('; ');
  const binding=f.sourceBindings?.[key];
  return binding?.status==='BOUND'?`Text characters ${escape(binding.selected?.start)}–${escape(binding.selected?.end)}`:'Source location needs review';
}
export function buildSummaryReport({title='Untitled case',draft={},generatedAt=new Date().toISOString()}={}) {
  const findings=list(draft.results),hasGaps=readingHasGaps(draft.analysis);
  const complete=draft.analysis?.status==='complete'&&!hasGaps;
  const main=findings.map((f,index)=>({f,index})).filter(({f})=>f.type!=='FALSE_POSITIVE');
  const excluded=findings.filter(f=>f.type==='FALSE_POSITIVE').length;
  const coverage=list(draft.analysis?.coverage).map((d,i)=>{
    const pages=list(d.pages),sections=list(d.sections);
    return `Transcript ${d.document??i+1}: ${pages.length?`${pages.filter(p=>p.analysisStatus==='complete').length} of ${d.pageCount??pages.length} pages fully compared`:`${sections.filter(s=>s.status==='complete').length} of ${sections.length} sections fully compared`}.`;
  });
  const articles=main.map(({f,index},n)=>{
    const quotes=['claim1','claim2'].map((key,i)=>{
      const question=f.sourceBindings?.[key]?.status==='BOUND'?f.sourceBindings[key].selected?.question:null;
      return `<div><h4>Transcript ${i+1}</h4>${question?`<p class="question">Question: ${escape(question)}</p>`:''}<blockquote>${escape(f[key]?.original??'Quote unavailable')}</blockquote><p class="source">${source(f,key)}</p></div>`;
    }).join('');
    const confidence=hybridBadge(f);
    return `<article><h2>${n+1}. ${escape(names[f.type]??'Needs review')}</h2><div class="quotes">${quotes}</div><p>${escape(firstSentence(f.reasoning??'')||'Review these statements in their original context.')}</p><p><b>Confidence:</b> ${escape(confidence.value)} · ${escape(confidence.text)}</p>${f.hybridConfidence?.objections?.length?`<p><b>Reviewer concern:</b> ${list(f.hybridConfidence.objections).map(escape).join(' ')}</p>`:''}${draft.reviewed?.[index]?'<p class="source">Marked reviewed in the app.</p>':''}${draft.notes?.[index]?`<p><b>Your note:</b> ${escape(draft.notes[index])}</p>`:''}</article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} · Review report</title><style>
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20323d;margin:0}main{max-width:850px;margin:auto;padding:36px}h1{font-size:28px;letter-spacing:-.7px;margin:8px 0}h2{font-size:19px;margin:0 0 14px}h4{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#60737f}.meta,.source{font-size:11px;color:#60737f}.summary{padding:18px 0;border-bottom:1px solid #dce4e8}.warning{padding:14px;border:1px solid #c09853;background:#fff7e8}.quotes{display:grid;grid-template-columns:1fr 1fr;gap:24px}.quotes>div{min-width:0}blockquote{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:17px/1.5 Georgia,serif}.question{font-size:12px}article{padding:24px 0;border-bottom:1px solid #dce4e8}p{overflow-wrap:anywhere}.toolbar{padding:15px;text-align:center;background:#f5f8fa}.toolbar button{border:0;background:#176d73;color:white;border-radius:9px;padding:12px 20px;font:inherit}.toolbar p{font-size:12px}footer{font-size:11px;color:#60737f;margin-top:24px}@media(max-width:600px){main{padding:20px}.quotes{grid-template-columns:1fr}}@media print{.toolbar{display:none}main{padding:0;max-width:none}article{break-inside:avoid}.quotes{grid-template-columns:1fr 1fr}h2{break-after:avoid}@page{margin:17mm}}
</style></head><body><div class="toolbar"><button onclick="window.print()">Save as PDF</button><p>In the print dialog, choose Save as PDF.</p></div><main><header><p class="meta">DEPOSITION REVIEW · ${escape(generatedAt)}</p><h1>${escape(title)}</h1></header><section class="summary"><p><b>${main.filter(({f})=>['DIRECT','INFERENTIAL'].includes(f.type)).length} potential contradiction${main.filter(({f})=>['DIRECT','INFERENTIAL'].includes(f.type)).length===1?'':'s'}</b> · ${main.filter(({f})=>!['DIRECT','INFERENTIAL'].includes(f.type)).length} need review · ${excluded} other comparisons marked not contradictions</p><p>${complete?'All planned comparisons finished. This does not guarantee every contradiction was found.':'Incomplete review. Unread or unvalidated passages may contain additional contradictions.'}</p>${coverage.map(c=>`<p class="source">${escape(c)}</p>`).join('')}${hasGaps?'<p class="warning">Compare retained notes only. Reading gaps remain.</p>':''}</section>${articles||'<p>No potential contradictions were returned. This does not prove the documents are consistent.</p>'}<footer>AI findings require human review. Experimental hybrid scores are points, not probabilities of correctness. Exact source quotes are retained above. This report includes no full transcript dump or technical diagnostics. Exporting makes no AI requests.</footer></main></body></html>`;
}

export function openSummaryPdfReport(snapshot,browser=window) {
  const html=buildSummaryReport(snapshot),tab=browser.open('','_blank');
  if(!tab)throw new Error('Allow pop-ups for this site, then click Download PDF report again.');
  tab.opener=null;tab.document.open();tab.document.write(html);tab.document.close();tab.focus?.();tab.print();
}
