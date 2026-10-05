export function phraseExists(original, phrase) {
    // null means Claude found no evidence for this field, which is allowed
    if (phrase === null) {
        return true;
    }

    if (typeof original !== "string" || typeof phrase !== "string" || phrase.length === 0) {
        return false;
    }

    return original.includes(phrase);
}

export function validateClaim(claim, transcript) {
    if (!claim || typeof claim.original !== "string" || !claim.original.trim() ||
        !Array.isArray(claim.qualifierPhrases)) return false;
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
        if (typeof qualifier !== "string" || !phraseExists(claim.original, qualifier)) {
            return false;
        }
    }

    return true;
}
