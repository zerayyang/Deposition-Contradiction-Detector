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