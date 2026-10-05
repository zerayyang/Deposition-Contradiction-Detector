import { validateClaim } from "./evidenceValidator.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { calculateHumanConfidence } from "./confidenceratehuman.js";
import { calculateEvidenceScore, calculateEvidenceCoverage, compareFacts, reconcile } from "./comparisonRules.js";

function sourceContext(transcript, quote) {
    const index = transcript.indexOf(quote);
    if (index < 0 || transcript.indexOf(quote, index + quote.length) >= 0) return "";
    const prefix = transcript.slice(0, index);
    const question = [...prefix.matchAll(/^Q:\s*(.*)$/gm)].at(-1);
    return question ? question[1] : "";
}
function scopeWarnings(fact1, fact2) {
    const text = fact => `${fact.context ?? ""} ${fact.original}`.toLowerCase();
    const a = text(fact1), b = text(fact2);
    const dates = value => value.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?\b/g) ?? [];
    const da = dates(a), db = dates(b);
    const norm = value => value.replace(/(\d)(st|nd|rd|th)/g, "$1").replace(/,/g, "");
    const warnings = [];
    if (da.length === 1 && db.length === 1 && norm(da[0]) !== norm(db[0])) warnings.push("The sources specify different calendar dates; conflict scoring was withheld.");
    if (fact1.person && fact2.person && fact1.person.toLowerCase() !== fact2.person.toLowerCase()) warnings.push("Different literal person references need clarification; conflict scoring was withheld.");
    if (/\b(?:before|after|since|until)\b/.test(a) !== /\b(?:before|after|since|until)\b/.test(b) && /\b(?:heard|knew|know|met|meet)\b/.test(a + b)) warnings.push("Knowledge/contact testimony has mismatched time scope; conflict scoring was withheld.");
    return warnings;
}

// Model type/reasoning/semantic assistance never enter the score calculation.
// Claude supplies literal evidence; code validates it and applies fixed rules.
export function assessCandidate(candidate, transcript1, transcript2) {
    if (!candidate || typeof candidate !== "object" ||
        !["DIRECT", "INFERENTIAL", "FALSE_POSITIVE"].includes(candidate.type)) {
        throw new Error("Invalid candidate classification in model response");
    }
    const claim1Valid = validateClaim(candidate.claim1, transcript1);
    const claim2Valid = validateClaim(candidate.claim2, transcript2);
    if (!claim1Valid || !claim2Valid) {
        return {...candidate, claim1Valid, claim2Valid, humanConfidence: null,
            evidenceScore: null, evidenceDetails: [], languageScore: null,
            evidenceCoverage: null, coverageCapped: false, coverageCap: null,
            basis: "UNVERIFIED", comparisons: {}, flag: "REVIEW",
            reasons: ["Quote or extracted phrase failed source validation; confidence was withheld."]};
    }
    const fact1 = new TestimonyFact(candidate.claim1);
    const fact2 = new TestimonyFact(candidate.claim2);
    fact1.context = sourceContext(transcript1, candidate.claim1.original);
    fact2.context = sourceContext(transcript2, candidate.claim2.original);
    const scopeReasons = scopeWarnings(fact1, fact2);
    const evidence = scopeReasons.length ? {score: null, details: []} : calculateEvidenceScore(fact1, fact2);
    const evidenceCoverage = scopeReasons.length ? 0 : calculateEvidenceCoverage(fact1, fact2);
    const confidence = calculateHumanConfidence(candidate.claim1.original,
        candidate.claim2.original, evidence.score, evidenceCoverage, evidence.details);
    const comparisons = compareFacts(fact1, fact2);
    const reconciliation = reconcile(candidate.type, evidence.score, evidence.details, comparisons);
    return {...candidate, claim1Valid, claim2Valid, humanConfidence: confidence.score,
        evidenceScore: confidence.evidenceScore, evidenceDetails: confidence.evidenceDetails,
        languageScore: confidence.languageScore, evidenceCoverage,
        coverageCapped: confidence.coverageCapped, coverageCap: confidence.coverageCap,
        basis: confidence.basis, comparisons, flag: scopeReasons.length ? "REVIEW" : reconciliation.flag, reasons: [...scopeReasons, ...reconciliation.reasons]};
}
