import { normalize, parseTimeRange } from "./parsers.js";

// This vocabulary describes venues, not people or fixture-specific answers.
const venueFamilies = [
    ["store", /\b(?:store|shop|supermarket)\b/],
    ["gym", /\b(?:gym|gymnasium|fitness cent(?:er|re))\b/],
    ["library", /\blibrary\b/], ["hospital", /\bhospital\b/],
    ["school", /\bschool\b/], ["office", /\boffice\b/],
    ["warehouse", /\bwarehouse\b/], ["restaurant", /\brestaurant\b/],
    ["cafe", /\b(?:cafe|café|coffee shop)\b/], ["bank", /\bbank\b/],
    ["courthouse", /\bcourthouse\b/], ["home", /^(?:home|my house)$/],
];
const months = "january|february|march|april|may|june|july|august|september|october|november|december";
const datePattern = new RegExp(`\\b(${months}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`, "g");
const weekdays = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g;

function dateKey(text) {
    const matches = [...normalize(text).matchAll(datePattern)];
    const monthNames = months.split("|");
    if (matches.some(m => {
        const month = monthNames.indexOf(m[1]);
        const days = new Date(Date.UTC(Number(m[3] ?? 2000), month + 1, 0)).getUTCDate();
        return Number(m[2]) < 1 || Number(m[2]) > days;
    })) return null;
    const dates = matches.map(m => `${m[1]} ${Number(m[2])}${m[3] ? ` ${m[3]}` : ""}`);
    // Multiple dates cannot identify which occurrence was meant.
    const anchors = new Set(dates.length ? dates : normalize(text).match(weekdays) ?? []);
    return anchors.size === 1 ? [...anchors][0] : null;
}

function venue(text) {
    const label = normalize(text).replace(/^(?:the|a|an)\s+/, "");
    // Relations, multiple venues and broader areas do not establish separate places.
    if (!label || /\b(?:in|inside|within|near|outside|across|next|beside|part|area|building|mall|and|or|not)\b/.test(label)) return null;
    const matches = venueFamilies.filter(([, pattern]) => pattern.test(label));
    if (matches.length !== 1) return null;
    return { label, family: matches[0][0] };
}

export function locationAssertion(fact, config) {
    const source = normalize(fact.sourceStatement || fact.original).replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
    // A complete affirmative first-person assertion. Reported speech, denied excerpts,
    // plans, multiple clauses and unrecognized syntax are deliberately not matched.
    const match = source.match(/^(?:(?:i think|i believe)\s+)?i (?:(?:saw (.+?) at)|(?:was at)) (.+)$/);
    if (!match) return null;
    if (match[1] && (/^(?:him|her|them|someone|somebody|anyone|anybody|nobody|everyone|he|she|they|it)$/.test(match[1]) || /^(?:a|an|the|another|some)\b/.test(match[1]))) return null;
    const rest = match[2];
    const boundary = rest.search(/\s+(?:on\s+|at\s+(?=\d|noon\b|midnight\b))/);
    if (boundary < 0) return null;
    const location = venue(rest.slice(0, boundary));
    if (!location) return null;
    const suffix = rest.slice(boundary).trim();
    // Remove date tokens before parsing clocks so September 11 isn't read as 11 AM.
    const timeText = suffix.replace(datePattern, "").replace(weekdays, "").replace(/\b(?:on|at)\b/g, " ").trim();
    if (!/^(?:(?:around|about|roughly|approximately|maybe|perhaps)\s+)*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)$/.test(timeText)) return null;
    const time = parseTimeRange(timeText, {text: fact.context}, config);
    return { subject: match[1]?.trim() ?? "@witness", action: match[1] ? "saw" : "was at", location,
        date: dateKey(`${fact.context ?? ""} ${suffix}`), time, target: fact.sourceStatement || fact.original };
}

export function compareLocations(f1, f2, config) {
    const a = locationAssertion(f1, config), b = locationAssertion(f2, config);
    if (!a || !b) return { reason: "UNSUPPORTED_PATTERN", explanation: "Location comparison needs two supported affirmative presence or sighting statements." };
    if (a.subject !== b.subject || a.action !== b.action) return { reason: "MISSING_CONTEXT", explanation: "The source statements describe different people or actions." };
    if (!a.date || !b.date || a.date !== b.date) return { reason: "MISSING_CONTEXT", explanation: "Location comparison needs the same unambiguous source date." };
    if (!a.time || !b.time || a.time.missing || b.time.missing) return { reason: "MISSING_CONTEXT", explanation: "Both location times need a resolved clock time and AM/PM." };
    if (a.time.approximate || b.time.approximate || a.time.earliest !== b.time.earliest) return { reason: "MISSING_CONTEXT", explanation: "Different or approximate sighting times may describe separate visits; no location conflict is established." };
    if (a.location.label === b.location.label) return { verdict: "COMPATIBLE", a, b, explanation: "The same person, date, exact time and venue description agree." };
    // Aliases and two names within one venue family need more location identity data.
    if (a.location.family === b.location.family) return { reason: "UNSUPPORTED_PATTERN", explanation: "Different names within one venue family may be aliases; venue identity is unresolved." };
    return { verdict: "CONFLICT", a, b, explanation: "The same person's presence or sighting is assigned different venue types on the same source date at the same exact time.",
        limits: ["This supports a conflict between the location accounts under the ordinary reading that these are separate venues. Co-location or containment is not independently verified; the score is a heuristic, not proof of physical impossibility or dishonesty."] };
}
