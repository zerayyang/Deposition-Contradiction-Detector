const money = amount => `US $${amount.toFixed(2)}`;

export default function ConfidenceAllowance({allowance,analysisBudget,onPartialApproval}) {
  return <section className="combined-review-cost" aria-label="Confidence allowance">
    <b>Confidence included · allowance {money(allowance.budgetUsd)}</b>
    <p>7 AI checks per eligible finding. Forecast: {allowance.forecastFindings} findings with 25% headroom. Unused reservations are released.</p>
    {allowance.requiresPartialApproval && <div className="confidence-budget-warning">
      <strong>Confidence checks may stop early</strong>
      <p>Estimated reserve: {money(allowance.requiredBudgetUsd)}. Server limit: {money(allowance.serverBudgetLimitUsd)}. This review offers {money(allowance.budgetUsd)} for confidence. Your analysis and completed scores will be kept; remaining findings will show “Not checked”.</p>
      {allowance.canFitEstimatedFinding===false ? <p role="alert">This allowance cannot cover one estimated confidence review. Use a shorter complete Q/A excerpt or review the server limit before starting.</p> :
        <label className="confidence-budget-ack"><input type="checkbox" checked={allowance.partialApproved===true} onChange={event=>onPartialApproval(event.target.checked)}/>
          <span>I understand some findings may remain unchecked within this allowance.</span></label>}
    </div>}
    {!allowance.requiresPartialApproval && <p>Unusually large output may require more approval; spending never silently exceeds this reserve.</p>}
    <p>Analysis limit + confidence allowance: {money(analysisBudget+allowance.budgetUsd)}. The borderline double-check is additional, as described above.</p>
  </section>;
}
