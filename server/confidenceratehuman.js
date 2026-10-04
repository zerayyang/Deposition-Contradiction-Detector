const STRONG_LANGUAGE = [
    "never",
    "always",
    "none",
    "all",
    "every",
    "no one",
    "nothing",
    "definitely",
    "certainly",
    "absolutely",
    "without question",
    "i know",
    "i know for certain",
    "i am certain",
    "i clearly remember",
    "i distinctly remember",
    "i specifically remember",
    "i remember",
    "i saw it myself",
    "i witnessed it"
];

const UNCERTAIN_LANGUAGE = [
    "i think",
    "i believe",
    "i suppose",
    "maybe",
    "perhaps",
    "possibly",
    "might",
    "may",
    "could have",
    "probably",
    "i guess",
    "i assume",
    "i don't think",
    "i think not"
];

const MEMORY_LIMITATIONS = [
    "i don't remember",
    "i can't recall",
    "i do not recall",
    "i don't remember exactly",
    "i vaguely remember",
    "i'm not sure",
    "i'm uncertain",
    "i can't say for sure",
    "i wouldn't swear to it",
    "i have no independent recollection",
    "it's been a long time",
    "almost a year ago",
    "to the best of my recollection",
    "as best i can remember",
    "as far as i remember",
    "if i remember correctly",
    "from what i remember",
    "i seem to remember"
];

const APPROXIMATION_LANGUAGE = [
    "around",
    "about",
    "approximately",
    "roughly",
    "or so",
    "give or take",
    "something like",
    "or something"
];

const LIMITED_SCOPE = [
    "most",
    "mostly",
    "some",
    "sometimes",
    "occasionally",
    "briefly"
];

const HABITUAL_LANGUAGE = [
    "generally",
    "typically",
    "usually",
    "normally"
];

const SECOND_HAND_LANGUAGE = [
    "i was told",
    "someone told me",
    "i learned later",
    "i heard afterward"
];

const INFERENCE_LANGUAGE = [
    "i inferred",
    "i assumed",
    "i concluded"
];

const REAFFIRMATION_LANGUAGE = [
    "as i testified previously",
    "i stand by my prior testimony"
];

const CORRECTION_LANGUAGE = [
    "i need to correct my earlier testimony",
    "i misspoke",
    "what i meant was"
];
function calculateDiminishingAdjustment(text, phrases, initialWeight) {
    let matches = 0;

    // Match complete words/phrases instead of substrings.
    // This prevents "all" from matching "recall"
    // and "may" from matching "maybe".
    for (const phrase of phrases) {
        const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const pattern = new RegExp(
            `(?<!\\w)${escapedPhrase}(?!\\w)`,
            "i"
        );

        if (pattern.test(text)) {
            matches++;
        }
    }

    let adjustment = 0;
    let currentWeight = initialWeight;

    // Every additional match is worth half as much.
    for (let i = 0; i < matches; i++) {
        adjustment += currentWeight;
        currentWeight /= 2;
    }

    return adjustment;
}


// Calculate the strength of the witness's language only
// This does not use Claude's contradiction classification.
export function calculateLanguageScore(claim1, claim2) {

    function scoreSingleClaim(claim) {
        const text = claim.toLowerCase();

        // Start at neutral language strength
        let score = 0.5;

        // Strong/certain language
        score += calculateDiminishingAdjustment(
            text,
            STRONG_LANGUAGE,
            0.05
        );

        // Uncertain/hedging language
        score += calculateDiminishingAdjustment(
            text,
            UNCERTAIN_LANGUAGE,
            -0.05
        );

        // Memory limitations
        score += calculateDiminishingAdjustment(
            text,
            MEMORY_LIMITATIONS,
            -0.08
        );

        // Approximation
        score += calculateDiminishingAdjustment(
            text,
            APPROXIMATION_LANGUAGE,
            -0.02
        );

        // Limited scope
        score += calculateDiminishingAdjustment(
            text,
            LIMITED_SCOPE,
            -0.02
        );

        // Habit/general behavior
        score += calculateDiminishingAdjustment(
            text,
            HABITUAL_LANGUAGE,
            -0.04
        );

        // Second-hand information
        score += calculateDiminishingAdjustment(
            text,
            SECOND_HAND_LANGUAGE,
            -0.06
        );

        // Explicit inference or assumption
        score += calculateDiminishingAdjustment(
            text,
            INFERENCE_LANGUAGE,
            -0.05
        );

        // Reaffirming previous testimony
        score += calculateDiminishingAdjustment(
            text,
            REAFFIRMATION_LANGUAGE,
            0.04
        );

        // Correcting previous testimony
        score += calculateDiminishingAdjustment(
            text,
            CORRECTION_LANGUAGE,
            -0.06
        );

        // Keep individual language score between 0 and 1
        return Math.max(0, Math.min(1, score));
    }

    const claim1Score = scoreSingleClaim(claim1);
    const claim2Score = scoreSingleClaim(claim2);

    // The contradiction is only as linguistically strong
    // as the less-committed statement.
    return Math.min(claim1Score, claim2Score);
}

// Calculate the final human confidence score
// using deterministic evidence, language rules,
// and evidence coverage.
//
// Claude's contradiction type and semanticAssist are NOT used here.
export function calculateHumanConfidence(
    claim1,
    claim2,
    evidenceScore,
    evidenceCoverage
) {

    const languageScore = calculateLanguageScore(
        claim1,
        claim2
    );

    const EVIDENCE_WEIGHT = 0.70;
    const LANGUAGE_WEIGHT = 0.30;

    let finalScore;

    // If deterministic evidence is available,
    // use the normal 70/30 weighting.
    if (evidenceScore !== null) {

        const weightedScore =
            (evidenceScore * EVIDENCE_WEIGHT) +
            (languageScore * LANGUAGE_WEIGHT);

        // Evidence coverage limits how confident
        // the system can ultimately be.
        let maximumConfidence;

        if (evidenceCoverage >= 0.75) {
            maximumConfidence = 0.85;
        } else if (evidenceCoverage >= 0.50) {
            maximumConfidence = 0.70;
        } else if (evidenceCoverage >= 0.25) {
            maximumConfidence = 0.60;
        } else {
            maximumConfidence = 0.55;
        }

        finalScore = Math.min(
            weightedScore,
            maximumConfidence
        );

    } else {

        // Without deterministic evidence, language
        // cannot create high-confidence contradiction evidence.
        finalScore = Math.min(
            languageScore,
            0.55
        );
    }

    // Convert from 0-1 to 0-100
    finalScore *= 100;

    return Math.round(finalScore);
}


console.log(
    "RECALL TEST:",
    calculateDiminishingAdjustment(
        "I can't recall exactly what happened.",
        ["all"],
        0.05
    )
);

console.log(
    "MAYBE TEST:",
    calculateDiminishingAdjustment(
        "Maybe I saw him.",
        ["may"],
        0.05
    )
);

console.log(
    "REAL MATCH TEST:",
    calculateDiminishingAdjustment(
        "I may have seen him.",
        ["may"],
        0.05
    )
);



console.log(
    "EQUAL:",
    calculateLanguageScore(
        "I saw the car.",
        "I saw the car."
    )
);

console.log(
    "STRONG VS UNCERTAIN:",
    calculateLanguageScore(
        "I definitely saw the car.",
        "I think I saw the car."
    )
);

console.log(
    "UNCERTAIN VS STRONG:",
    calculateLanguageScore(
        "I think I saw the car.",
        "I definitely saw the car."
    )
);