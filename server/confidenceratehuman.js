// The active heuristic evidence index accepts validated facts, never model metadata.
// Formula weights and bands are uncalibrated placeholders in SCORING_CONFIG.
export { scoreFacts as calculateHumanConfidence, scoreFacts, evidenceBand } from "./scoring/engine.js";
export { SCORING_CONFIG } from "./scoring/config.js";
