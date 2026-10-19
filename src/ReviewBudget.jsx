import {reviewBudgetOptions, selectedReviewBudget} from './lib/reviewBudget.js';

const dollars = amount => `US $${amount.toFixed(2)}`;

export default function ReviewBudget({plan, onChange}) {
  const {suggested, lower, extra, capped} = reviewBudgetOptions(plan);
  const selected = selectedReviewBudget(plan);
  const choices = [
    {name: 'Lower limit', value: lower, text: 'May stop early. Completed work is kept.'},
    {name: 'Recommended', value: suggested, text: 'A conservative allowance for analysis.'},
    {name: 'Extra headroom', value: extra, text: 'More room for longer responses. Only usage is charged.'},
  ];
  return <section className="review-budget" aria-label="Analysis spending limit">
    <div className="review-budget-heading"><div><span className="review-budget-label">Analysis spending limit</span>
      <strong>{dollars(selected)}</strong></div>
      {plan.budgetFixed ? <span className="review-budget-fixed">Saved limit</span> :
        <span className="review-budget-tag">{selected < suggested ? 'May stop early' : selected > suggested ? 'Extra headroom' : 'Recommended'}</span>}
    </div>
    {plan.budgetFixed ? <p>This saved review keeps its approved remaining allowance.</p> :
      <details className="review-budget-adjust"><summary>Adjust limit <span aria-hidden="true">⌄</span></summary>
        <div className="review-budget-choices" role="group" aria-label="Choose analysis allowance">
          {choices.map(({name,value,text}, index) => <button type="button" key={name}
            disabled={(index === 2 && extra <= suggested) || (index === 0 && lower >= suggested)}
            aria-pressed={selected === value && !(index === 2 && extra === suggested)}
            onClick={() => onChange(value)}><span>{name}</span><strong>{dollars(value)}</strong><small>{text}</small></button>)}
        </div>
        <p>A higher limit adds room; it cannot guarantee completion. Confidence checks have a separate allowance.</p>
      </details>}
    {capped && <p className="review-budget-warning">The server limit is below the full analysis allowance. This review may stop with partial coverage.</p>}
  </section>;
}
