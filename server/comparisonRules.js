export function parseTime(timePhrase) {
    if (timePhrase === null) {
        return null;
    }

    const text = timePhrase.toLowerCase().trim();

    // Explicitly known times
    if (text.includes("midnight")) {
        return [0];
    }

    if (text.includes("noon")) {
        return [12 * 60];
    }

    // Do not interpret vague periods as exact times
    if (
        text.includes("morning") ||
        text.includes("afternoon") ||
        text.includes("evening") ||
        text.includes("night")
    ) {
        return null;
    }

    // Accept times with or without AM/PM.
    const matches = [
        ...text.matchAll(
            /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g
        )
    ];

    if (matches.length === 0) {
        return null;
    }

    const times = [];

    for (const match of matches) {
        let hour = Number(match[1]);
        const minute = match[2] ? Number(match[2]) : 0;
        const period = match[3];

        // Invalid clock times
        if (hour < 1 || hour > 12 || minute > 59) {
            continue;
        }

        if (period === "pm" && hour !== 12) {
            hour += 12;
        }

        if (period === "am" && hour === 12) {
            hour = 0;
        }

        if (period === undefined) {
            // Without AM/PM, both possibilities are possible.
            times.push(hour * 60 + minute);
            
            if (hour !== 12) {
                times.push((hour + 12) * 60 + minute);
            }
        } else {
            times.push(hour * 60 + minute);
        }
    }

    if (times.length === 0) {
        return null;
    }

    return [...new Set(times)];
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




// Detect whether a statement contains explicit negative language
export function hasNegation(text) {
    if (text === null) {
        return false;
    }

    const lower = text.toLowerCase();

    const negativePhrases = [
        "never",
        "no",
        "not",
        "didn't",
        "did not",
        "don't",
        "do not",
        "hadn't",
        "had not",
        "haven't",
        "have not"
    ];

    return negativePhrases.some(phrase =>
        lower.includes(phrase)
    );
}



// Remove explicit negative language so the underlying activity can be compared
export function normalizeActivity(activity) {
    if (activity === null) {
        return null;
    }

    return activity.toLowerCase().trim();
}


// Determine whether two activity phrases are similar enough
// for our code to safely compare them
export function activitiesAreComparable(fact1, fact2) {

    if (fact1.activity === null || fact2.activity === null) {
        return false;
    }

    const activity1 = normalizeActivity(fact1.activity);
    const activity2 = normalizeActivity(fact2.activity);

    // Exact same underlying activity
    if (activity1 === activity2) {
        return true;
    }

    // One activity phrase contains the other
    if (
        activity1.includes(activity2) ||
        activity2.includes(activity1)
    ) {
        return true;
    }

    return false;
}




/// Convert activity comparison into deterministic evidence strength
export function scoreActivityEvidence(fact1, fact2) {

    // Only score activities when our code can safely compare them
    if (!activitiesAreComparable(fact1, fact2)) {
        return null;
    }

    const activity1 = normalizeActivity(fact1.activity);
    const activity2 = normalizeActivity(fact2.activity);

    const negative1 = hasNegation(fact1.activity);
    const negative2 = hasNegation(fact2.activity);

    // Same underlying activity with the same polarity is compatible
    if (activity1 === activity2 && negative1 === negative2) {
        return 0;
    }

    // Same underlying activity with opposite polarity is deterministic conflict evidence
    if (activity1 === activity2 && negative1 !== negative2) {
        return 1;
    }

    return null;
}


// Compare activities stated in two pieces of testimony
export function compareActivities(activity1, activity2) {
    // If either activity is missing, there is not enough evidence
    // to make a deterministic comparison.
    if (activity1 === null || activity2 === null) {
        return "UNKNOWN";
    }

    const act1 = activity1.toLowerCase().trim();
    const act2 = activity2.toLowerCase().trim();

    // Exactly the same activity
    if (act1 === act2) {
        return "SAME";
    }

    // Compatible statements about remaining/staying at home
    const stayedHome1 =
        act1.includes("at home") ||
        act1.includes("stayed home") ||
        act1.includes("staying home");

    const stayedHome2 =
        act2.includes("at home") ||
        act2.includes("stayed home") ||
        act2.includes("staying home");

    const neverLeft1 =
        act1.includes("never left") ||
        act1.includes("did not leave") ||
        act1.includes("didn't leave");

    const neverLeft2 =
        act2.includes("never left") ||
        act2.includes("did not leave") ||
        act2.includes("didn't leave");

    if (
        (stayedHome1 && neverLeft2) ||
        (stayedHome2 && neverLeft1)
    ) {
        return "SAME";
    }

    // Obvious opposite activity statements
    const oppositePairs = [
        ["entered", "never entered"],
        ["entered", "did not enter"],
        ["entered", "didn't enter"],
        ["met", "never met"],
        ["met", "did not meet"],
        ["met", "didn't meet"],
        ["stayed home", "went out"],
        ["staying home", "going out"],
        ["asleep", "awake"],
        ["sleeping", "awake"]
    ];

    for (const [first, second] of oppositePairs) {
        if (
            (act1.includes(first) && act2.includes(second)) ||
            (act1.includes(second) && act2.includes(first))
        ) {
            return "CONFLICT";
        }
    }

    // Different activities do not automatically mean contradiction
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

    // Check every possible interpretation of each time.
    for (const firstTime of minutes1) {
        for (const secondTime of minutes2) {
            let difference = Math.abs(firstTime - secondTime);

            // Handle times across midnight.
            difference = Math.min(
                difference,
                1440 - difference
            );

            // If any plausible interpretations are close,
            // the statements are compatible.
            if (difference <= 60) {
                return "COMPATIBLE";
            }
        }
    }

    // Every plausible interpretation is more than an hour apart.
    return "POSSIBLE_CONFLICT";
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


// Determine whether location and activity together provide
// deterministic evidence of a contradiction.
export function scoreLocationActivityEvidence(fact1, fact2) {

    const location1 = fact1.location?.toLowerCase().trim() || "";
    const location2 = fact2.location?.toLowerCase().trim() || "";

    const activity1 = fact1.activity?.toLowerCase().trim() || "";
    const activity2 = fact2.activity?.toLowerCase().trim() || "";

    const home1 = location1.includes("home");
    const home2 = location2.includes("home");

    const wentOut1 =
        activity1.includes("went out") ||
        activity1.includes("left home") ||
        activity1.includes("left the house");

    const wentOut2 =
        activity2.includes("went out") ||
        activity2.includes("left home") ||
        activity2.includes("left the house");

    if (home1 && wentOut2) {
        return 1;
    }

    if (home2 && wentOut1) {
        return 1;
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

    // Activity evidence
    const activityScore = scoreActivityEvidence(fact1, fact2);

    if (activityScore !== null) {
        scores.push(activityScore);
}
    // Location + activity evidence
    const locationActivityScore =
        scoreLocationActivityEvidence(fact1, fact2);

    if (locationActivityScore !== null) {
        scores.push(locationActivityScore);
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



// Calculate how much of the testimony our deterministic
// system was actually able to evaluate
export function calculateEvidenceCoverage(fact1, fact2) {
    let availableEvidence = 0;
    let totalEvidence = 0;

    // Time
    // Only count time as available if both times can actually
    // be deterministically compared.
    if (
        fact1.time !== null &&
        fact2.time !== null &&
        compareTimes(fact1.time, fact2.time) !== "UNKNOWN"
    ) {
        totalEvidence++;
        availableEvidence++;
    }

    // Quantity
    // Only count quantity when both claims describe the same object.
    if (fact1.quantity !== null || fact2.quantity !== null) {
        if (quantitiesAreComparable(fact1, fact2)) {
            totalEvidence++;
            availableEvidence++;
        }
    }

    // Activity
    // Only count activity when our deterministic activity
    // comparison can actually be performed.
    if (fact1.activity !== null || fact2.activity !== null) {
        if (activitiesAreComparable(fact1, fact2)) {
            totalEvidence++;
            availableEvidence++;
        }
    }

    // Location
    // Location by itself is not currently used to calculate
    // evidenceScore, so do not count it toward coverage.
    // It is used through location + activity evidence below.

    // Location + activity
    if (
        (fact1.location !== null && fact2.activity !== null) ||
        (fact2.location !== null && fact1.activity !== null)
    ) {
        const locationActivityScore =
            scoreLocationActivityEvidence(fact1, fact2);

        if (locationActivityScore !== null) {
            totalEvidence++;
            availableEvidence++;
        }
    }

    // State
    // State is currently compared by compareFacts(), but there is
    // no deterministic state scoring function yet, so do not count
    // it toward evidence coverage.

    if (totalEvidence === 0) {
        return 0;
    }

    return availableEvidence / totalEvidence;
}



const activityTest1 = {
    activity: "ordered pizza",
    time: null,
    quantity: null,
    object: null,
    location: null,
    state: null
};

const activityTest2 = {
    activity: "went out briefly",
    time: null,
    quantity: null,
    object: null,
    location: null,
    state: null
};

