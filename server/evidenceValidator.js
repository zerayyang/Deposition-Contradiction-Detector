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
