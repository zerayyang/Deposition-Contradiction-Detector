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

function containsAny(text, phrases) {
    return phrases.some(phrase => text.includes(phrase));
}


function calculateDiminishingAdjustment(text, phrases, initialWeight) {
    let matches = 0;

    // Count how many phrases from this category appear
    for (const phrase of phrases) {
        if (text.includes(phrase)) {
            matches++;
        }
    }

    let adjustment = 0;
    let currentWeight = initialWeight;

    // Every additional match is worth half as much
    for (let i = 0; i < matches; i++) {
        adjustment += currentWeight;
        currentWeight /= 2;
    }

    return adjustment;
}


export function calculateHumanConfidence(claim1, claim2, type) {
    const text = `${claim1} ${claim2}`.toLowerCase();

    // Start at moderate confidence
    let score = 60;

    // Strong/certain language
    // +5, +2.5, +1.25, +0.625...
    score += calculateDiminishingAdjustment(
        text,
        STRONG_LANGUAGE,
        5
    );

    // Uncertain/hedging language
    // -5, -2.5, -1.25, -0.625...
    score += calculateDiminishingAdjustment(
        text,
        UNCERTAIN_LANGUAGE,
        -5
    );

    // Memory limitations have a stronger negative effect
    // -8, -4, -2, -1...
    score += calculateDiminishingAdjustment(
        text,
        MEMORY_LIMITATIONS,
        -8
    );

    // Approximation has a smaller effect
    // -2, -1, -0.5, -0.25...
    score += calculateDiminishingAdjustment(
        text,
        APPROXIMATION_LANGUAGE,
        -2
    );

    // Limited scope
    score += calculateDiminishingAdjustment(
        text,
        LIMITED_SCOPE,
        -2
    );

    // Habit/general behavior instead of event-specific recollection
    score += calculateDiminishingAdjustment(
        text,
        HABITUAL_LANGUAGE,
        -4
    );

    // Second-hand information
    score += calculateDiminishingAdjustment(
        text,
        SECOND_HAND_LANGUAGE,
        -6
    );

    // Explicit inference or assumption
    score += calculateDiminishingAdjustment(
        text,
        INFERENCE_LANGUAGE,
        -5
    );

    // Reaffirming previous testimony
    score += calculateDiminishingAdjustment(
        text,
        REAFFIRMATION_LANGUAGE,
        4
    );

    // Correcting previous testimony
    score += calculateDiminishingAdjustment(
        text,
        CORRECTION_LANGUAGE,
        -6
    );

    // Contradiction classification
    if (type === "DIRECT") {
        score += 5;
    } else if (type === "INFERENTIAL") {
        score -= 3;
    } else if (type === "FALSE_POSITIVE") {
        score -= 5;
    }

    // Keep score between 0 and 100 and return a whole number
    score = Math.max(0, Math.min(100, score));

    return Math.round(score);
}


