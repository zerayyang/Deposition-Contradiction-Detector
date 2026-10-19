export function confidenceApprovalReady(allowance) {
  return Boolean(allowance) && allowance.canFitEstimatedFinding!==false &&
    (!allowance.requiresPartialApproval || allowance.partialApproved===true);
}
