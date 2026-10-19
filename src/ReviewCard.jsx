import FindingSource from './FindingSource.jsx';
import {sourceBindingMessage} from './lib/sourceStatus.js';
import HybridConfidence from "./HybridConfidence.jsx";
import { shortRule, firstSentence, askQuestion } from "./lib/shortLabels.js";
export function ScoreGuide() {
  return <details className="score-guide"><summary>About AI agreement</summary><p>Two AI models each read a finding three ways. A separate checker reviews the source without seeing their votes. Exact source checks are required. Agreement describes those reads; it is not measured accuracy or a probability that a witness is lying.</p></details>;
}

export function ReviewCard({result:r,texts=[],files=[],onDownloadOriginal}) {
  const notEvaluable = r.status === "NOT_EVALUABLE";
  const reasoning = r.reasoning ?? "No explanation provided.";
  const question = askQuestion(reasoning);
  const assessment = question ? reasoning.replace(/(?:neutral\s+|possible\s+)?follow[- ]up(?:\s+question)?\s*:\s*["'“‘]?([\s\S]*?\?)["'”’]?/i, "").trim() : reasoning;
  const labelFor = type => type === "DIRECT" ? "Direct" : type === "INFERENTIAL" ? "Inferential" : type === "NEEDS_REVIEW" ? "Needs review" : "False positive";
  const label = r.labelDisagreement ? "Uncertain" : labelFor(r.type);
  const review = notEvaluable || r.flag === "REVIEW" || /^(Unresolved timing|Question meaning unresolved)/i.test(reasoning);
  return <article className={`review-card ${r.type?.toLowerCase() ?? ""}`}>
    <header className="card-heading"><span className={`type-chip ${r.type?.toLowerCase()}`}>{label}</span>{shortRule(r.typeRule) && <span className="rule-chip">{shortRule(r.typeRule)}</span>}{review && <span className="review-chip">Check</span>}</header>
    {r.consistency?.agreed === false && <section className="label-disagreement"><b>Two reads disagree</b><p>First: {labelFor(r.consistency.firstType)} · Second: {labelFor(r.consistency.secondType)}</p>{r.consistency.secondReasoning && <p className="muted">{r.consistency.secondReasoning}</p>}</section>}
    {r.labelDisagreement && !r.consistency && <section className="label-disagreement"><b>Labels disagree — review.</b> These comparisons of the same witness answers reached different categories:<ul>{(r.mergedViews ?? []).map(v=><li key={v.id}><b>{labelFor(v.type)}:</b> {v.issue}<details><summary>Reasoning</summary><p>{v.reasoning}</p></details></li>)}</ul></section>}
    <div className="quote-grid">{[r.claim1,r.claim2].map((claim,i)=><blockquote key={i}><span className="eyebrow">Transcript {i+1}</span><p>“{claim?.original ?? "No quote available."}”</p><FindingSource number={i+1} claim={claim} binding={r.sourceBindings?.[`claim${i+1}`]} references={r.sourceReferences?.[`claim${i+1}`]} text={texts[i]} file={files[i]} onDownload={onDownloadOriginal?()=>onDownloadOriginal(i):undefined}/></blockquote>)}</div>
    <section className="finding"><p className="summary-line">{firstSentence(assessment) || "Compare the two quotes."}</p></section>
    {question && <div className="suggested-question"><small>Ask</small><p>“{question}”</p></div>}
    <HybridConfidence result={r} />
    <details className="more-details"><summary>More details</summary>
    <section className="finding"><h4>Full explanation</h4><p>{assessment}</p>{r.typeRule && <p><b>Label rule:</b> {r.typeRule}</p>}{r.reviewNote && <p><b>Check:</b> {r.reviewNote}</p>}</section>
    {r.eventDetails && <details><summary>Source-linked event details</summary><p>{r.eventDetails.notice}</p>{r.eventDetails.records.map((event,i)=><section key={i}><h4>Transcript {i+1}: {event.summary}</h4><ul>{event.attributes.map((a,n)=><li key={n}>{a.name}: {a.value??a.state.toLowerCase()}</li>)}</ul>{event.sources.map(s=><blockquote key={s.id}>{s.quote}<small> · {s.pageRefs.length?s.pageRefs.map(p=>'PDF page '+p.pdfPage).join(', '):'text offsets '+s.start+'–'+s.end}</small></blockquote>)}</section>)}</details>}
    {r.sourceReferences && <section className="source-citations"><b>Source references</b>{['claim1','claim2'].map((key,i)=><p key={key}>Transcript {i+1}: {(r.sourceReferences[key]?.length?r.sourceReferences[key]:[{missing:true}]).map((p,j)=><span key={j}>{j>0?' · ':''}{p.missing?'Exact source location unavailable. View the full transcript above.':p.pdfPage?`PDF page ${p.pdfPage} (label ${p.pageLabel})`:`text characters ${p.start}–${p.end}`}</span>)}</p>)}{r.supportingAnalyses?.length>1 && <small>{r.supportingAnalyses.length} matching section findings combined; exact quotes and analysis variants retained.</small>}</section>}
    {r.sourceBindings && <section className="source-citations"><b>Witness context</b>{['claim1','claim2'].map((key,i)=>{
      const binding=r.sourceBindings[key];
      return binding?.status==='BOUND'?<details key={key}><summary>Transcript {i+1}: one witness occurrence located</summary><p><b>Question:</b> {binding.selected.question || 'No explicit question supplied.'}</p><p style={{whiteSpace:'pre-wrap'}}><b>Full answer:</b> {binding.selected.answer}</p><small>Text characters {binding.selected.start}–{binding.selected.end}</small></details>:<p key={key}>Transcript {i+1}: {sourceBindingMessage(binding)} No answer location was selected.</p>;
    })}</section>}
    <section className="follow-up"><span className="eyebrow">Next step</span><h3>Suggested follow-up questions</h3><p>Ask for the missing facts without assuming which account is correct.</p>
      <details><summary>General questioning templates</summary><ul><li>“Which event and time period does each statement refer to?”</li><li>“What did you mean by that phrase in your earlier answer?”</li><li>“Please explain how these two accounts fit together, including any exceptions or corrections.”</li></ul><small>Templates for review; they are not additional evidence or a finding that either answer is false.</small></details>
    </section>
    </details>
  </article>;
}
