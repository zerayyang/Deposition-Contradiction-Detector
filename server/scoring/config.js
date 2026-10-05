// All scoring weights, caps, tolerances and display thresholds live here.
// These are uncalibrated heuristic choices, not probabilities.
export const SCORING_CONFIG = {
    version: "evidence-index-v1",
    commitmentBaseline: 0.80, // Neutral assertion commitment.
    certaintyBonus: 0.10, // Each scoped certainty marker, with diminishing returns.
    certaintyCap: 0.20, // Maximum certainty addition.
    hedgePenalty: 0.12, // Assertion uncertainty, not value approximation.
    memoryPenalty: 0.22, // Failure to recall the compared assertion.
    habitualPenalty: 0.10, // Habit does not establish one particular occurrence.
    secondHandPenalty: 0.15, // Reported rather than directly asserted experience.
    inferencePenalty: 0.12, // Assertion explicitly qualified as an inference.
    correctionPenalty: 0.06, // Small adjustment for explicit correction.
    reaffirmationBonus: 0.04, // Small adjustment for reaffirmation.
    correctionReaffirmationCap: 0.08, // Maximum combined correction/reaffirmation effect.
    diminishingFactor: 0.5, // Each further negative marker contributes less.
    assertionPenaltyCap: 0.45, // Maximum combined assertion penalty.
    commitmentFloor: 0.30, // Lower bound of assertion commitment.
    commitmentCeiling: 1, // Upper bound.
    evidenceMix: 0.5, // Uncalibrated fixed evidence term in E*(mix + commitmentMix*C).
    commitmentMix: 0.5, // Uncalibrated commitment influence; sensitivity script varies this.
    compatibleCeiling: 0.15, // Small compatibility index, never a contradiction rating.
    minimumConflictStrength: 0.70, // Non-overlapping ranges have at least this support.
    explicitStrength: 1, // Verified opposing factual assertions.
    derivedStrength: 1, // Equally verified derived conflicts get equal strength.
    timeToleranceMinutes: 30, // Widen each approximate clock endpoint by this amount.
    timeGapForFullStrength: 90, // Range gap at which temporal support reaches full strength.
    midnightAlignmentWindow: 120, // Align only clock ranges near the same midnight boundary.
    qualifierValueDistance: 12, // Maximum characters between a value and its qualifier in a clause.
    quantityToleranceFraction: 0.20, // Relative widening of approximate amounts.
    quantityToleranceMinimum: 1, // Minimum widening for approximate counts.
    quantityGapForFullStrength: 4, // Gap in matching units giving full numeric support.
    minutesPerDay: 1440, // Clock normalization unit.
    afternoonRange: [12 * 60, 18 * 60], // Broad interval; afternoon is not noon.
    eveningRange: [18 * 60, 24 * 60], // Operational evening interval.
    morningRange: [0, 12 * 60], // Operational morning interval.
    bands: { STRONG: 75, MODERATE: 50, LIMITED: 25 }, // Uncalibrated display bands.
};
