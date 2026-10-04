export function phraseExists(original, phrase) {
    // null means Claude found no evidence for this field, which is allowed
    if (phrase === null) {
        return true;
    }

    const originalLower = original.toLowerCase();
    const phraseLower = phrase.toLowerCase();

    return originalLower.includes(phraseLower);
}



export function validateClaim(claim) {
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