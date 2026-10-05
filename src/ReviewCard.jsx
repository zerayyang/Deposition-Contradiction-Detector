const percent = value => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Unavailable";
const ruleNames = {time:"Time comparison",state:"Opposing states",timeline:"Timeline conflict","activity polarity":"Action affirmed vs denied","location+activity":"Home presence vs departure",knowledge:"Awareness or meeting",quantity:"Amount comparison"};
const reasonLabels = {NO_FACTS:"The code has no supported facts to compare.",UNSUPPORTED_PATTERN:"This comparison is outside the patterns the code can verify.",MISSING_CONTEXT:"The comparison needs clearer person, event, day or time context.",UNVERIFIED_SOURCE:"A quote or extracted phrase could not be verified against the source."};

export function ScoreGuide() {
  return <details className="score-guide"><summary>How to read the confidence score</summary>
    <p>The score measures support from human-written code rules. It is not the probability that the witness is lying. Claude's classification and the code check are separate.</p>
    <div className="guide-grid">
      <div><h4>Evidence strength (E)</h4><p>How strongly the best applicable rule supports a conflict. <b>1.00 means full rule strength</b>; 0.70 means partial rule strength. These are configured values, not measured probabilities.</p></div>
      <div><h4>Claim commitment (C)</h4><p>How firmly the relevant claim is expressed. Each claim starts at <b>0.80</b>. Scoped hedges or memory uncertainty lower it. The pair uses the lower claim value.</p></div>
      <div><h4>Language adjustments</h4><p>A hedge adjustment of <b>−0.12</b> lowers commitment by 12 points, from 0.80 to 0.68. “Around” widens the value range instead of also reducing commitment.</p></div>
      <div><h4>Facts compared</h4><p>The number of extracted field types used by applicable rules. It describes coverage; it does not cap the score or measure how much of the transcript was checked.</p></div>
    </div>
    <div className="formula"><b>Score = round(100 × E × (0.50 + 0.50 × C))</b><p>With E = 1.00 and C = 0.68, the result is 84. Evidence strength multiplies the whole score; this is not a simple 50/50 average.</p></div>
    <p><b>Bands:</b> Strong 75–100 · Moderate 50–74 · Limited 25–49 · Weak below 25. These thresholds and weights are provisional.</p>
    <p><b>Not evaluable</b> means no score is available. It does not mean the statements are compatible. <b>Compatible</b> means applicable code rules found only compatibility; its separate index is capped at 15 and is not a contradiction rating.</p>
  </details>;
}

function followUp(reasoning) {
  const match = reasoning.match(/(?:neutral\s+|possible\s+)?follow[- ]up(?:\s+question)?\s*:\s*["'“‘]?([\s\S]*?\?)/i);
  return match?.[1]?.trim() ?? null;
}

export function ReviewCard({result:r, dismissed=false}) {
  const notEvaluable = r.status === "NOT_EVALUABLE";
  const compatible = r.status === "COMPATIBLE_SUPPORTED";
  const support = (r.rulesFired ?? []).filter(rule=>rule.verdict === "CONFLICT");
  const context = (r.rulesFired ?? []).filter(rule=>rule.verdict === "COMPATIBLE");
  const reasoning = r.reasoning ?? "No explanation provided.";
  const question = followUp(reasoning);
  const assessment = question ? reasoning.replace(/(?:neutral\s+|possible\s+)?follow[- ]up(?:\s+question)?\s*:\s*["'“‘]?([\s\S]*?\?)["'”’]?/i, "").trim() : reasoning;
  const label = r.type === "DIRECT" ? "Direct" : r.type === "INFERENTIAL" ? "Inferential" : "False positive";
  const review = notEvaluable || r.flag === "REVIEW" || /^(Unresolved timing|Question meaning unresolved)/i.test(reasoning);
  return <article className={`review-card ${r.type?.toLowerCase() ?? ""}`}>
    <header className="card-heading"><span className={`type-chip ${r.type?.toLowerCase()}`}>{label}</span><span className="muted">AI importance: {r.severity?.toLowerCase() ?? "unspecified"}</span>{review && <span className="review-chip">Clarification needed</span>}</header>
    <div className="quote-grid">{[r.claim1,r.claim2].map((claim,i)=><blockquote key={i}><span className="eyebrow">Transcript {i+1}</span><p>“{claim?.original ?? "No quote available."}”</p></blockquote>)}</div>
    <section className="finding"><h3>What the testimony shows</h3><p>{assessment || "Review the source quotes and suggested follow-up below."}</p><small className="muted">Claude's assessment. It does not determine the code score.</small></section>
    <section className={`verification ${notEvaluable ? "unavailable" : ""}`}>
      <div className="verification-heading"><div><span className="eyebrow">Code verification</span><h3>{notEvaluable ? "Not evaluable" : compatible ? "Compatible under code rules" : dismissed ? `${r.band?.toLowerCase() ?? "Unknown"} rule support` : `${r.humanConfidence} / 100`}</h3></div>{!notEvaluable && !compatible && !dismissed && <span className="band-chip">{r.band?.toLowerCase()} support</span>}</div>
      <p>{notEvaluable ? reasonLabels[r.notEvaluableReason] ?? "More context is needed before code can score this pair." : compatible ? "The applicable rules support compatibility. This does not change Claude's category." : "A heuristic evidence-support score, not a probability of dishonesty."}</p>
      {support.length>0 && <ul className="rule-list">{support.map(rule=><li key={rule.id}><b>{ruleNames[rule.id] ?? rule.id}.</b> {rule.explanation}</li>)}</ul>}
      {context.length>0 && <ul className="rule-list">{context.map(rule=><li key={rule.id}><b>{ruleNames[rule.id] ?? rule.id}.</b> {rule.explanation}</li>)}</ul>}
      <details className="calculation"><summary>See calculation and limitations</summary>
        {!notEvaluable && !compatible && r.commitment && <p className="formula">100 × {r.evidenceStrength?.toFixed(2)} × (0.50 + 0.50 × {r.commitment.pair.toFixed(2)}) = <b>{r.humanConfidence}</b></p>}
        {compatible && <p>Separate compatibility index: {r.humanConfidence} / 15. This is not confidence in a contradiction.</p>}
        {r.commitment && <div className="metric-grid"><div><b>{percent(r.evidenceStrength)}</b><span>Evidence rule strength</span></div><div><b>{percent(r.commitment.claim1)}</b><span>Claim 1 commitment</span></div><div><b>{percent(r.commitment.claim2)}</b><span>Claim 2 commitment</span></div><div><b>{percent(r.commitment.pair)}</b><span>Lower commitment used</span></div></div>}
        {notEvaluable && <p>No calculation is applied. Commitment values alone cannot activate a conflict score.</p>}
        {support.map(rule=><p key={rule.id}><b>{ruleNames[rule.id] ?? rule.id}:</b> strength {rule.strength.toFixed(2)}; {rule.basis.toLowerCase()} reasoning.</p>)}
        {(r.rulesLimiting ?? []).length>0 && <><h4>Limitations and language handling</h4><ul>{r.rulesLimiting.map((rule,i)=><li key={i}>{rule.explanation}</li>)}</ul></>}
        {r.languageDetails && <><h4>Word database matches</h4>{["claim1","claim2"].map((key,i)=><div key={key}><b>Claim {i+1}</b><ul>{[...(r.languageDetails[key]?.applied ?? []),...(r.languageDetails[key]?.ignored ?? [])].map((d,j)=><li key={j}>“{d.phrase}” — {d.effect ? `${d.effect>0?"+":""}${Math.round(d.effect*100)} commitment points` : "no commitment adjustment"}. {d.explanation}</li>)}</ul></div>)}</>}
        {r.factsCompared && <p>Field types compared: {r.factsCompared.compared} of {r.factsCompared.total}. Informational; no score cap.</p>}
        <small className="muted">Configuration: {r.configVersion}. Weights and bands need validation against reviewed examples.</small>
      </details>
    </section>
    <section className="follow-up"><span className="eyebrow">Next step</span><h3>Suggested follow-up questions</h3><p>Ask for the missing facts without assuming which account is correct.</p>
      {question && <div className="suggested-question"><small>Suggested in Claude's assessment</small><p>“{question}”</p></div>}
      <details open={!question}><summary>General questioning templates</summary><ul><li>“Which event and time period does each statement refer to?”</li><li>“What did you mean by that phrase in your earlier answer?”</li><li>“Please explain how these two accounts fit together, including any exceptions or corrections.”</li></ul><small>Templates for review; they are not additional evidence or a finding that either answer is false.</small></details>
    </section>
  </article>;
}
