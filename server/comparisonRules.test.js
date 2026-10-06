import assert from "node:assert/strict";


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

// Active scoring contracts are covered by scoring/scoring.test.js.
const { validateClaim } = await import("./evidenceValidator.js");
const claim = (original, overrides = {}) => ({original, activityPhrase:null,timePhrase:null,
    locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,
    qualifierPhrases:[],...overrides});
const homeQuote = "I was at home all evening.";
const { assessCandidate } = await import("./humanConfidencePipeline.js");
const outQuote = "I think I went out briefly.";
const candidate = {type:"DIRECT",claim1:claim(homeQuote,{locationPhrase:"at home"}),
    claim2:claim(outQuote,{activityPhrase:"went out briefly"})};
const result=assessCandidate(candidate,
    `Q: Where were you on November 3rd?\nA: ${homeQuote}`,
    `Q: What happened on November 3rd?\nA: ${outQuote}`);
const { scoreStateEvidence, scoreActivityEvidence, calculateEvidenceCoverage } = await import("./comparisonRules.js");
assert.equal(scoreStateEvidence({...fact(""), state:"tired"}, {...fact(""), state:"hungry"}), null);
assert.equal(scoreStateEvidence({...fact(""), state:"awake"}, {...fact(""), state:"asleep"}), 1);
assert.equal(scoreActivityEvidence(fact("I signed the lease", "signed the lease"), fact("I did not sign the lease", "did not sign the lease")), 1);
assert.equal(scoreActivityEvidence(fact("I might sign", "might sign the lease"), fact("I signed", "signed the lease")), null);
assert.equal(scoreLocationActivityEvidence(fact("I was home at 6 PM", null, "home"), groceriesFact), null);
assert.equal(scoreLocationActivityEvidence(fact("I was home all evening except for shopping", null, "home"), groceriesFact), null);
const mixed = calculateEvidenceScore({...homeFact, time:"7pm"}, {...groceriesFact, time:"7pm"});
assert.equal(mixed.score, 1);
assert.ok(mixed.details.some(detail => detail.score === 0));

assert.equal(calculateEvidenceCoverage(homeFact, groceriesFact), 1);
assert.equal(compareTimes("10pm tonight", "10pm tomorrow"), "UNKNOWN");
assert.equal(compareTimes("8pm", "8:05pm"), "CONFLICT");
assert.equal(compareTimes("around 8pm", "8:05pm"), "COMPATIBLE");
assert.equal(compareTimes("around 10:30pm", "midnight"), "POSSIBLE_CONFLICT");
assert.equal(compareTimes("around 8pm", "11pm"), "CONFLICT");
const dated = assessCandidate(candidate,
    `Q: Where were you on November 3rd?\nA: ${homeQuote}`,
    `Q: What happened on November 4th?\nA: ${outQuote}`);
assert.equal(dated.evidenceScore, null);
assert.equal(dated.flag, "REVIEW");
const aligned = assessCandidate(candidate,
    `Q: Where were you on November 3rd?\nA: ${homeQuote}`,
    `Q: Walk through November 3rd again.\nA: ${outQuote}`);
assert.equal(aligned.humanConfidence, result.humanConfidence);
const knowledge1 = "I'd never heard of him before this whole thing started.";
const knowledge2 = "I knew of him. We had mutual friends.";
const knowledgeScoped = assessCandidate({type:"DIRECT", claim1:claim(knowledge1), claim2:claim(knowledge2)}, knowledge1, knowledge2);
assert.equal(knowledgeScoped.evidenceScore, null);
assert.equal(knowledgeScoped.flag, "REVIEW");
assert.equal(calculateEvidenceScore(
    {...fact("I was awake at 6pm"), time:"6pm", state:"awake"},
    {...fact("I was asleep at 10pm"), time:"10pm", state:"asleep"}).score, null);
assert.equal(scoreLocationActivityEvidence(homeFact,
    {...groceriesFact, original:"I went out at 7am", time:"7am"}), null);
assert.equal(validateClaim(claim(homeQuote, {qualifierPhrases:[null]}), homeQuote), false);
console.log("All comparisonRules tests passed.");
