export function parseTime(timePhrase) {
    if (timePhrase === null) {
        return null;
    }

    const text = timePhrase.toLowerCase();

    // Handle words with known times
    if (text.includes("midnight")) {
        return 0;
    }

    if (text.includes("noon")) {
        return 12 * 60;
    }

    // Find a time such as 7pm, 7:30pm, 10, or 10:30
    const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);

    if (!match) {
        return null;
    }

    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const period = match[3];

    if (period === "pm" && hour !== 12) {
        hour += 12;
    }

    if (period === "am" && hour === 12) {
        hour = 0;
    }

    return hour * 60 + minute;
}


function hasApproximation(timePhrase) {
    if (timePhrase === null) {
        return false;
    }

    const text = timePhrase.toLowerCase();

    return (
        text.includes("around") ||
        text.includes("about") ||
        text.includes("approximately") ||
        text.includes("roughly")
    );
}


// Compare activities stated in the testimony
export function compareActivities(activity1, activity2) {

    // If either activity is missing, there is not enough evidence to compare
    if (activity1 === null || activity2 === null) {
        return "UNKNOWN";
    }

    const act1 = activity1.toLowerCase().trim();
    const act2 = activity2.toLowerCase().trim();

    if (act1 === act2) {
        return "SAME";
    }

    return "DIFFERENT";
}


// Time difference thresholds:
// Exact: 0-30 = compatible, 31-60 = possible conflict, 61+ = conflict
// Approximate: 0-45 = compatible, 46-90 = possible conflict, 91+ = conflict
export function compareTimes(time1, time2) {
    const minutes1 = parseTime(time1);
    const minutes2 = parseTime(time2);

    if (minutes1 === null || minutes2 === null) {
        return "UNKNOWN";
    }

    let difference = Math.abs(minutes1 - minutes2);
    difference = Math.min(difference, 1440 - difference);

    // Give more tolerance if either witness statement is approximate
    const approximate =
        hasApproximation(time1) || hasApproximation(time2);

    const compatibleLimit = approximate ? 45 : 30;
    const possibleConflictLimit = approximate ? 90 : 60;

    if (difference <= compatibleLimit) {
        return "COMPATIBLE";
    }

    if (difference <= possibleConflictLimit) {
        return "POSSIBLE_CONFLICT";
    }

    return "CONFLICT";
}


// Compare the locations stated in two pieces of testimony
export function compareLocations(location1, location2) {

    // If either location is missing, there is not enough evidence to compare
    if (location1 === null || location2 === null) {
        return "UNKNOWN";
    }

    // Ignore capitalization and extra spaces when comparing locations
    const loc1 = location1.toLowerCase().trim();
    const loc2 = location2.toLowerCase().trim();

    if (loc1 === loc2) {
        return "SAME";
    }

    // Different locations do not automatically mean there is a contradiction
    return "DIFFERENT";
}


// Compare numerical quantities stated in the testimony
export function compareQuantities(quantity1, quantity2) {

    // If either quantity is missing, there is not enough evidence to compare
    if (quantity1 === null || quantity2 === null) {
        return "UNKNOWN";
    }

    const number1 = Number(quantity1);
    const number2 = Number(quantity2);

    // If Claude extracted something that cannot be converted to a number
    if (Number.isNaN(number1) || Number.isNaN(number2)) {
        return "UNKNOWN";
    }

    if (number1 === number2) {
        return "SAME";
    }

    return "DIFFERENT";
}


// Compare states described in the testimony
export function compareStates(state1, state2) {

    // If either state is missing, there is not enough evidence to compare
    if (state1 === null || state2 === null) {
        return "UNKNOWN";
    }

    const s1 = state1.toLowerCase().trim();
    const s2 = state2.toLowerCase().trim();

    if (s1 === s2) {
        return "SAME";
    }

    return "DIFFERENT";
}


// Compare all deterministic fields between two testimony facts
export function compareFacts(fact1, fact2) {
    return {
        activity: compareActivities(fact1.activity, fact2.activity),
        time: compareTimes(fact1.time, fact2.time),
        location: compareLocations(fact1.location, fact2.location),
        quantity: compareQuantities(fact1.quantity, fact2.quantity),
        state: compareStates(fact1.state, fact2.state)
    };
}


// Convert a time comparison into deterministic evidence strength
export function scoreTimeEvidence(timeComparison) {
    if (timeComparison === "CONFLICT") {
        return 1;
    }

    if (timeComparison === "POSSIBLE_CONFLICT") {
        return 0.5;
    }

    if (timeComparison === "COMPATIBLE") {
        return 0;
    }

    // UNKNOWN should not help or hurt the score
    return null;
}


// Determine whether two quantities are safe to compare
export function quantitiesAreComparable(fact1, fact2) {

    // Both claims need a quantity
    if (fact1.quantity === null || fact2.quantity === null) {
        return false;
    }

    // Both claims need an object so we know what is being counted
    if (fact1.object === null || fact2.object === null) {
        return false;
    }

    const object1 = fact1.object.toLowerCase().trim();
    const object2 = fact2.object.toLowerCase().trim();

    // Only compare quantities when the objects match
    return object1 === object2;
}


// Convert quantity comparison into deterministic evidence strength
export function scoreQuantityEvidence(fact1, fact2) {

    // A numerical difference only matters if both quantities
    // are describing the same object
    if (!quantitiesAreComparable(fact1, fact2)) {
        return null;
    }

    const comparison = compareQuantities(
        fact1.quantity,
        fact2.quantity
    );

    if (comparison === "DIFFERENT") {
        return 1;
    }

    if (comparison === "SAME") {
        return 0;
    }

    return null;
}


// Calculate the deterministic evidence portion of the confidence score
export function calculateEvidenceScore(fact1, fact2) {
    const comparisons = compareFacts(fact1, fact2);

    const scores = [];

    // Time evidence
    const timeScore = scoreTimeEvidence(comparisons.time);

    if (timeScore !== null) {
        scores.push(timeScore);
    }

    // Quantity evidence
    const quantityScore = scoreQuantityEvidence(fact1, fact2);

    if (quantityScore !== null) {
        scores.push(quantityScore);
    }

    // If there is no deterministic evidence we can safely score,
    // do not pretend that we know
    if (scores.length === 0) {
        return null;
    }

    // Average only the evidence categories that were actually usable
    const total = scores.reduce((sum, score) => sum + score, 0);

    return total / scores.length;
}