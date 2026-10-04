export class TestimonyFact {
    constructor(claim) {
        this.original = claim.original;

        this.activity = claim.activityPhrase;
        this.time = claim.timePhrase;
        this.location = claim.locationPhrase;
        this.person = claim.personPhrase;
        this.object = claim.objectPhrase;
        this.quantity = claim.quantityPhrase;
        this.state = claim.statePhrase;

        this.qualifiers = claim.qualifierPhrases;
    }

    sameField(fieldName, otherFact) {
        const value1 = this[fieldName];
        const value2 = otherFact[fieldName];

        // We can't compare something if one side is unknown
        if (value1 === null || value2 === null) {
            return null;
        }

        return value1.toLowerCase() === value2.toLowerCase();
    }
}