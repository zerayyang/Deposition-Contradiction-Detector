export function phraseExists(original, phrase) {
    // null means Claude found no evidence for this field, which is allowed
    if (phrase === null) {
        return true;
    }

    if (original === null) {
        return false;
    }

    const originalLower = original.toLowerCase();
    const phraseLower = phrase.toLowerCase();

    return originalLower.includes(phraseLower);
}

export function validateClaim(claim, transcript) {
    // First verify that Claude's original quote
    // actually exists in the real transcript.
    if (!phraseExists(transcript, claim.original)) {
        return false;
    }

    const fields = [
        claim.activityPhrase,
        claim.timePhrase,
        claim.locationPhrase,
        claim.personPhrase,
        claim.objectPhrase,
        claim.quantityPhrase,
        claim.statePhrase
    ];

    for (const phrase of fields) {
        if (!phraseExists(claim.original, phrase)) {
            return false;
        }
    }

    for (const qualifier of claim.qualifierPhrases) {
        if (!phraseExists(claim.original, qualifier)) {
            return false;
        }
    }

    return true;
}

console.log(
    "VALID QUOTE:",
    validateClaim(
        {
            original: "I was home all evening.",
            activityPhrase: null,
            timePhrase: null,
            locationPhrase: "home",
            personPhrase: null,
            objectPhrase: null,
            quantityPhrase: null,
            statePhrase: null,
            qualifierPhrases: []
        },
        "Q: Where were you?\nA: I was home all evening."
    )
);

console.log(
    "FAKE QUOTE:",
    validateClaim(
        {
            original: "I was at the warehouse at 8 PM.",
            activityPhrase: null,
            timePhrase: "8 PM",
            locationPhrase: "warehouse",
            personPhrase: null,
            objectPhrase: null,
            quantityPhrase: null,
            statePhrase: null,
            qualifierPhrases: []
        },
        "Q: Where were you?\nA: I was home all evening."
    )
);