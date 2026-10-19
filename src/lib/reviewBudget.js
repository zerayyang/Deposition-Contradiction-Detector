// Round up, so formatting never silently reduces the suggested allowance.
const centsUp = value => Math.ceil((value - 1e-10) * 100) / 100;

export function reviewBudgetOptions(plan) {
  const limit = Number.isFinite(plan.serverBudgetLimitUsd) ? plan.serverBudgetLimitUsd : Infinity;
  const suggested = Math.min(limit, centsUp(plan.cost.conservativeBudget));
  return {
    suggested,
    lower: Math.max(.01, Math.floor(suggested * .75 * 100) / 100),
    extra: Math.min(limit, centsUp(suggested * 1.5)),
    capped: suggested < plan.cost.conservativeBudget,
  };
}

export function withSuggestedReviewBudget(plan) {
  // Resuming a saved job must keep its existing approved remaining allowance.
  if (plan.budgetFixed || plan.execution !== 'durable-steps') return plan;
  return {...plan, approvedBudgetUsd: reviewBudgetOptions(plan).suggested};
}

export function selectedReviewBudget(plan) {
  return plan.approvedBudgetUsd ?? plan.cost.conservativeBudget;
}
