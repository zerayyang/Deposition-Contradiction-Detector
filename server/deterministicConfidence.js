import { calculateLanguageScore } from "./confidenceratehuman.js";

// Only validated literal testimony enters this checker. No model labels,
// model reasoning, semantic suggestions, or extracted interpretations are used.
const MONTH = "(?:january|february|march|april|may|june|july|august|september|october|november|december)";
function dateOf(text) {
    const dates = text.match(new RegExp(`\\b${MONTH} \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b`, "g")) ?? [];
    return dates.length === 1 ? dates[0].replace(/(\d)(st|nd|rd|th)/g, "$1").replace(/,/g, "") : null;
}
function clockOf(text) {
    const matches = [...text.matchAll(/\b(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/g)];
    if (matches.length !== 1) return null;
    const [, hour, minute = "0", period] = matches[0];
    return (Number(hour) % 12 + (period === "pm" ? 12 : 0)) * 60 + Number(minute);
}
function uncertain(text) {
    return /\b(?:think|maybe|might|perhaps|around|about|approximately|remember|recall|not sure)\b/.test(text);
}
export function scoreValidatedQuotes(original1, original2, valid1, valid2) {
    const empty = (basis, reason) => ({score: null, evidenceScore: null, evidenceDetails: [],
        strength: basis === "UNVERIFIED" ? "Unverified evidence" : "Insufficient context",
        basis, scoreReason: reason, languageScore: null, coverageCapped: false, coverageCap: null});
    if (!valid1 || !valid2) return empty("UNVERIFIED", "A quote or extracted phrase could not be verified; no score assigned.");
    const a = original1.toLowerCase().trim();
    const b = original2.toLowerCase().trim();
    // Corrections, exceptions, and negation require interpretation outside
    // these narrow home/time patterns; withhold rather than overclaim.
    const complexScope = /\b(?:except|unless|but|not|never|misspoke|correction|correct)\b/;
    const details = [];
    const date1 = dateOf(a), date2 = dateOf(b);
    const sameDate = date1 !== null && date1 === date2;
    const continuousHome = text => /\bi was (?:at )?home all evening\b/.test(text);
    const leaving = text => /\bi (?:left home|left the house|went out)\b/.test(text);
    // Evening is explicitly defined here as 6 PM through 11:59 PM.
    // No inference from an unrelated location, missing date, or vague time.
    for (const [home, out] of [[a,b], [b,a]]) {
        const time = clockOf(out);
        if (!complexScope.test(home) && !complexScope.test(out) && sameDate && continuousHome(home) && leaving(out) && time !== null && time >= 1080) {
            details.push({rule: "location+activity", score: uncertain(home) || uncertain(out) ? 0.5 : 1,
                reason: "Same explicit date: continuous presence at home excludes leaving during the defined evening period (6 PM–midnight)."});
        }
    }
    // A deliberately narrow, complete assertion about the same named object.
    // Time-qualified or uncertain assertions do not match this rule.
    const signing = text => text.match(/^i (never signed|did not sign|signed) (the [a-z ]+)[.!]?$/);
    const sa = signing(a), sb = signing(b);
    if (sa && sb && sa[2] === sb[2]) {
        details.push({rule: "activity polarity", score: (sa[1] === "signed") !== (sb[1] === "signed") ? 1 : 0,
            reason: "Complete assertions about signing the same named object have opposing or matching polarity."});
    }
    // Time comparison requires the same literal event prefix and explicit date.
    const event = text => text.match(/^i (went to sleep|left home|arrived home) at /)?.[1];
    const t1 = clockOf(a), t2 = clockOf(b);
    if (!complexScope.test(a) && !complexScope.test(b) && sameDate && event(a) && event(a) === event(b) && t1 !== null && t2 !== null && !uncertain(a) && !uncertain(b)) {
        details.push({rule: "time", score: t1 === t2 ? 0 : 1,
            reason: "Same literal event and explicit date; exact AM/PM clock values compared without wrapping across dates."});
    }
    if (!details.length) return {...empty("INSUFFICIENT_CONTEXT", "No supported rule establishes a comparable fact and period. Review the surrounding questions and dates."), languageScore: calculateLanguageScore(original1, original2)};
    const score = Math.max(...details.map(detail => detail.score));
    const languageScore = calculateLanguageScore(original1, original2);
    // Wording can adjust supported evidence, but cannot manufacture conflict.
    const weightedScore = score === 0 ? 0 : Math.round((0.85 * score + 0.15 * languageScore) * 100);
    return {score: weightedScore, evidenceScore: score, evidenceDetails: details,
        strength: score === 1 ? "Strong conflict" : score === 0.5 ? "Possible conflict" : "No conflict established",
        basis: "EVIDENCE", scoreReason: "Rating: 85% strongest supported evidence + 15% language strength. Compatible evidence stays at zero; missing context receives no rating. Values are rule ratings, not probabilities.",
        languageScore, coverageCapped: false, coverageCap: null};
}
