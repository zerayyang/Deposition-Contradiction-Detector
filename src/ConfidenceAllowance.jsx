const money = amount => `US $${amount.toFixed(2)}`;

export default function ConfidenceAllowance({allowance,analysisBudget,onPartialApproval,plan}) {
  return <section className="combined-review-cost" aria-label="Confidence allowance">
    <div className="approval-price"><span>Review allowance</span><strong>{money(analysisBudget+allowance.budgetUsd)}</strong><small>Only usage is charged.</small></div>
    <dl className="approval-breakdown"><div><dt>Analysis</dt><dd>{money(analysisBudget)}</dd></div><div><dt>Confidence checks</dt><dd>{money(allowance.budgetUsd)}</dd></div></dl>
    <p className="approval-extra">Extra double-checks cost more. See cost details.</p>
    {allowance.requiresPartialApproval && <div className="confidence-budget-warning">
      <strong>Some scores may not finish</strong>
      <p>{money(allowance.budgetUsd)} may not cover every score. Finished results stay saved.</p>
      {allowance.canFitEstimatedFinding===false ? <p role="alert">This limit is too low to start score checks. Use a shorter Q/A excerpt or review the server limit.</p> :
        <label className="confidence-budget-ack"><input type="checkbox" checked={allowance.partialApproved===true} onChange={event=>onPartialApproval(event.target.checked)}/>
          <span>I understand some findings may remain unchecked.</span></label>}
    </div>}
    <details className="approval-cost-details"><summary>Cost details</summary>
      <p>7 AI checks per eligible finding. Forecast: {allowance.forecastFindings} findings with 25% headroom. Unused reservations are released.</p>
      {allowance.requiresPartialApproval&&<p>Estimated reserve: {money(allowance.requiredBudgetUsd)}. Server limit: {money(allowance.serverBudgetLimitUsd)}. Unfinished scores show “Not checked”.</p>}
      <p>Confidence checks stop at their approved allowance. More checks need new approval; there are no automatic retries.</p>
      <p>The borderline double-check costs extra: usually under US $0.10, with a local estimate of up to about US $0.35.</p>
      {plan&&<><p>{plan.documents.map((d,i)=>`Transcript ${i+1}: ${d.pageCount?d.pageCount+' PDF pages':'page count unavailable'}, ${d.sections} sections`).join(' · ')}</p>
        <p>{plan.requestCount} analysis request{plan.requestCount===1?'':'s'} · estimated {money(plan.cost.estimated)} · conservative allowance {money(plan.cost.conservativeBudget)}</p>
        <p>{plan.cost.note}</p></>}
      <p>Estimates may differ from your final bill. Cancelled or interrupted work may still be charged and may leave partial results.</p>
    </details>
  </section>;
}
