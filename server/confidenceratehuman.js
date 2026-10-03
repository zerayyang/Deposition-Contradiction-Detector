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

export function calculateHumanConfidence(claim1, claim2, type) {
    const text = `${claim1} ${claim2}`.toLowerCase();

    let score = 50;

    // Strong language
    if (containsAny(text, STRONG_LANGUAGE)) {
        score += 10;
    }

    // Uncertain or hedging language
    if (containsAny(text, UNCERTAIN_LANGUAGE)) {
        score -= 10;
    }

    // Memory limitations
    if (containsAny(text, MEMORY_LIMITATIONS)) {
        score -= 15;
    }

    // Approximate times, quantities, or descriptions
    if (containsAny(text, APPROXIMATION_LANGUAGE)) {
        score -= 5;
    }

    // Limited scope
    if (containsAny(text, LIMITED_SCOPE)) {
        score -= 3;
    }

    // Habit/general behavior instead of event-specific recollection
    if (containsAny(text, HABITUAL_LANGUAGE)) {
        score -= 7;
    }

    // Second-hand information
    if (containsAny(text, SECOND_HAND_LANGUAGE)) {
        score -= 10;
    }

    // Explicit inference or assumption
    if (containsAny(text, INFERENCE_LANGUAGE)) {
        score -= 8;
    }

    // Reaffirming previous testimony
    if (containsAny(text, REAFFIRMATION_LANGUAGE)) {
        score += 5;
    }

    // Correcting previous testimony
    if (containsAny(text, CORRECTION_LANGUAGE)) {
        score -= 12;
    }

    // Contradiction classification
    if (type === "DIRECT") {
        score += 5;
    } else if (type === "INFERENTIAL") {
        score -= 5;
    } else if (type === "FALSE_POSITIVE") {
        score -= 15;
    }

    // Keep the score within 0–100
    score = Math.max(0, Math.min(100, score));

    return score;
}