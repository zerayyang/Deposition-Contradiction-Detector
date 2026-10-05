import assert from "node:assert/strict";
import { calculateHumanConfidence } from "./confidenceratehuman.js";

import {
    parseTime,
    reconcile,
    calculateEvidenceScore,
    compareTimes,
    compareLocations,
    hasNegation,
    scoreLocationActivityEvidence,
    scoreKnowledgeEvidence
} from "./comparisonRules.js";

function fact(original, activity = null, location = null) {
    return {
        original,
        activity,
        location,
        time: null,
        quantity: null,
        object: null,
        state: null
    };
}


// --------------------------------------------------
// 1. Whole-word noon / midnight
// --------------------------------------------------

assert.equal(
    compareTimes(
        "all afternoon",
        "3pm"
    ),
    "UNKNOWN"
);


// --------------------------------------------------
// 2. Meridiem assumption
// --------------------------------------------------

assert.equal(
    compareTimes(
        "around 7",
        "7:30pm"
    ),
    "COMPATIBLE"
);


// --------------------------------------------------
// 3. Multiple times treated as range
// --------------------------------------------------

assert.equal(
    compareTimes(
        "around 10, maybe 10:30",
        "midnight"
    ),
    "POSSIBLE_CONFLICT"
);


// --------------------------------------------------
// 4. Date/duration numbers are not times
// --------------------------------------------------

assert.equal(
    parseTime("November 3rd"),
    null
);

assert.equal(
    parseTime("20 minutes"),
    null
);


// --------------------------------------------------
// 5. Negation word boundaries
// --------------------------------------------------

assert.equal(
    hasNegation("I know him"),
    false
);

assert.equal(
    hasNegation("I have no idea"),
    true
);

assert.equal(
    hasNegation("I wrote a note"),
    false
);

assert.equal(
    hasNegation("I did not meet him"),
    true
);


// --------------------------------------------------
// 6. Location + activity negation
// --------------------------------------------------

assert.equal(
    scoreLocationActivityEvidence(
        fact(
            "I was at home all evening",
            "I was at home all evening",
            "home"
        ),
        fact(
            "I never left the house",
            "I never left the house",
            "parking lot"
        )
    ),
    null
);


// A location on one side and an activity on the other are sufficient.
const homeFact = fact(
    "I was at home all evening",
    null,
    "at home"
);
const groceriesFact = fact(
    "went out briefly to get some groceries",
    "went out briefly to get some groceries",
    null
);

assert.equal(
    scoreLocationActivityEvidence(homeFact, groceriesFact),
    1
);
assert.equal(
    scoreLocationActivityEvidence(groceriesFact, homeFact),
    1
);
assert.deepEqual(calculateEvidenceScore(homeFact, groceriesFact), {
    score: 1, details: [{ rule: "location+activity", score: 1 }]
});
assert.deepEqual(calculateEvidenceScore(fact("unknown"), fact("unknown")), {
    score: null, details: []
});

// Missing activity must not bypass the negation guard.
assert.equal(
    scoreLocationActivityEvidence(
        homeFact,
        fact("I never left the house", "I never left the house", null)
    ),
    null
);


// --------------------------------------------------
// 7. Knowledge/contact evidence
// --------------------------------------------------

assert.equal(
    scoreKnowledgeEvidence(
        fact(
            "No. I'd never heard of him before this whole thing started."
        ),
        fact(
            "I knew of him. We had mutual friends. I don't think I'd met him face to face."
        )
    ),
    1
);


// Different verb families should not match.
assert.equal(
    scoreKnowledgeEvidence(
        fact(
            "I never heard of him."
        ),
        fact(
            "I had never met him."
        )
    ),
    null
);


// Hedged negation should not produce deterministic evidence.
assert.equal(
    scoreKnowledgeEvidence(
        fact(
            "I knew of him."
        ),
        fact(
            "I don't think I'd met him face to face."
        )
    ),
    null
);


assert.equal(compareLocations("at home", "home"), "SAME");
assert.equal(compareLocations("In my, the HOME!", "home"), "SAME");
assert.equal(compareLocations("at home", "parking lot"), "DIFFERENT");
assert.equal(compareLocations(null, "home"), "UNKNOWN");

// Reconciliation never changes Claude's type or responds to hedges.
assert.deepEqual(reconcile("FALSE_POSITIVE", 0, [{rule: "time", score: 0}], {}), {
    flag: "NONE", reasons: []
});
assert.deepEqual(reconcile("INFERENTIAL", 1, [{rule: "knowledge", score: 1}], {}), {
    flag: "REVIEW", reasons: ["Code found an explicit conflict; AI labeled it inferential"]
});
const knowledgeEvidence = calculateEvidenceScore(
    fact("I never heard of him."), fact("I knew of him.")
);
assert.deepEqual(knowledgeEvidence.details, [{ rule: "knowledge", score: 1.0 }]);
assert.equal(reconcile("INFERENTIAL", knowledgeEvidence.score, knowledgeEvidence.details, {}).flag, "REVIEW");
const hedgedConfidence = calculateEvidenceScore(homeFact, fact(
    "I think I went out briefly to get some groceries",
    "went out briefly to get some groceries"
));
assert.equal(hedgedConfidence.score, 1);
assert.deepEqual(reconcile("DIRECT", hedgedConfidence.score, hedgedConfidence.details, {}), {
    flag: "NONE", reasons: []
});
assert.equal(reconcile("FALSE_POSITIVE", 0.5, [{rule: "time", score: 0.5}], {}).flag, "REVIEW");
assert.equal(reconcile("DIRECT", 0, [{rule: "time", score: 0}], {}).flag, "REVIEW");
assert.equal(reconcile("INFERENTIAL", 0, [{rule: "time", score: 0}], {}).flag, "REVIEW");
assert.equal(reconcile("INFERENTIAL", 1, [{rule: "time", score: 1}], {}).flag, "NONE");
assert.equal(reconcile("DIRECT", null, [], {}).flag, "NONE");

// Details survive confidence calculation, and only actual coverage caps are labeled.
const knowledgeDetails = [{ rule: "knowledge", score: 1 }];
const capped = calculateHumanConfidence("I knew of him", "I never heard of him", 1, 0.25, knowledgeDetails);
assert.equal(capped.score, 60);
assert.equal(capped.coverageCap, 60);
assert.equal(capped.coverageCapped, true);
assert.deepEqual(capped.evidenceDetails, knowledgeDetails);
assert.equal(calculateHumanConfidence("I knew of him", "I never heard of him", 0, 0.25, []).coverageCapped, false);
assert.equal(calculateHumanConfidence("I knew of him", "I never heard of him", null, 0, []).coverageCapped, false);

// Active conflict scoring uses only verified literal quotes, never model type.
const { scoreValidatedQuotes } = await import("./deterministicConfidence.js");
const { validateClaim } = await import("./evidenceValidator.js");
const check = (a, b) => scoreValidatedQuotes(a, b, true, true);
const home = "I was at home all evening on November 3.";
const out = "I left home at 7 PM on November 3.";
assert.equal(check(home, out).strength, "Strong conflict");
assert.equal(check(out, home).score, 93);
assert.equal(check(home + " Except for a trip to the store.", out).score, null);
assert.equal(check(home, "I never said I left home at 7 PM on November 3.").score, null);
assert.equal(check("I was at home at 6 PM on November 3.", out).score, null);
assert.equal(check(home, "I left home at 7 PM.").score, null);
assert.equal(check(home, "I left home at 7 PM on November 4.").score, null);
assert.equal(check(home, "I left home at 7 AM on November 3.").score, null);
assert.equal(check(home, "I left home at around 7 PM on November 3.").strength, "Possible conflict");
assert.equal(check("I signed the lease.", "I never signed the lease.").score, 93);
assert.equal(check("I signed the lease.", "I signed the lease.").score, 0);
assert.equal(check("I signed the lease.", "I never signed the contract.").score, null);
assert.equal(check("I don't remember whether I signed the lease.", "I signed the lease.").score, null);
assert.equal(check("I went to sleep at 10 PM on November 3.", "I went to sleep at 12 AM on November 4.").score, null);
assert.equal(check("I went to sleep at 10 PM on November 3.", "I went to sleep at 11 PM on November 3.").score, 93);
assert.equal(scoreValidatedQuotes(home, out, false, true).basis, "UNVERIFIED");
assert.equal(scoreValidatedQuotes(undefined, undefined, false, false).score, null);
assert.equal(validateClaim({original: "actual quote"}, "actual quote"), false);
assert.equal(compareTimes("midnight", "12pm"), "POSSIBLE_CONFLICT");
assert.equal(compareTimes("midnight", "12am"), "COMPATIBLE");
const weighted = check(home, "I left home at around 7 PM on November 3.");
assert.equal(weighted.score, Math.round((0.85 * weighted.evidenceScore + 0.15 * weighted.languageScore) * 100));
assert.equal(weighted.strength, "Possible conflict");
assert.equal(check("I never signed the lease.", "I never signed the lease.").score, 0);
assert.equal(check("I definitely remember everything.", "I clearly remember everything.").score, null);
assert.equal(scoreValidatedQuotes(home, out, false, true).score, null);
console.log("All comparisonRules tests passed.");