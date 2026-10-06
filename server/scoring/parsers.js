import { SCORING_CONFIG } from "./config.js";

export const normalize = text => String(text ?? "").toLowerCase().replace(/[’]/g, "'").trim();
export const overlaps = (a, b) => a.earliest <= b.latest && b.earliest <= a.latest;
export const clauses = text => {
    const out = [];
    const pattern = /[^.!?;,]+/g;
    for (const match of text.matchAll(pattern)) {
        let offset = match.index;
        for (const part of match[0].split(/\b(?:but|and)\b/i)) {
            const start = text.indexOf(part, offset);
            if (part.trim()) out.push({ text: part, start, end: start + part.length });
            offset = start + part.length;
        }
    }
    return out;
};

export function parseTimeRange(phrase, context = {}, config = SCORING_CONFIG) {
    const text = normalize(phrase);
    if (!text || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(text) || /\b\d+\s*(?:seconds?|minutes?|hours?|days?|years?)\b/.test(text)) return null;
    const named = /\bafternoon\b/.test(text) ? config.afternoonRange : /\bevening\b/.test(text) ? config.eveningRange : /\bmorning\b/.test(text) ? config.morningRange : null;
    const tokens = [...text.matchAll(/\b(?:midnight|noon)\b|\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?\b/g)];
    if (!tokens.length) return named ? { earliest: named[0], latest: named[1], interval: true, approximate: false, widenedBy: 0 } : null;
    // A trailing explicit period in an interval also qualifies its earlier endpoint.
    const explicitPeriods = [...text.matchAll(/(?:\d)\s*(am|pm)\b/g)].map(m => m[1]);
    const uniquePeriod = new Set(explicitPeriods).size === 1 ? explicitPeriods[0] : null;
    const periodContext = normalize(context.period ?? context.text);
    const contextualPeriod = /\b(?:pm|evening|night|tonight|late)\b/.test(periodContext) ? "pm" : /\b(?:am|morning)\b/.test(periodContext) ? "am" : null;
    const values = [];
    for (const token of tokens) {
        const t = token[0].trim();
        if (t === "midnight") { values.push(config.minutesPerDay); continue; }
        if (t === "noon") { values.push(12 * 60); continue; }
        const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
        if (!m) return null;
        let hour = Number(m[1]);
        const period = m[3] ?? uniquePeriod ?? contextualPeriod;
        if (hour >= 1 && hour <= 12 && !period) return { missing: "AM_PM" };
        if (period && hour > 12) return null;
        if (period === "pm" && hour < 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
        values.push(hour * 60 + Number(m[2] ?? 0));
    }
    const interval = /\b(?:from|until|through|between)\b|\d\s*(?:to|-)\s*\d/.test(text) && values.length > 1;
    if (interval && values.at(-1) < values[0]) values[values.length - 1] += config.minutesPerDay;
    const approximate = /\b(?:around|about|roughly|approximately|maybe|perhaps)\b/.test(text);
    const widenedBy = approximate ? config.timeToleranceMinutes : 0;
    let earliest = Math.min(...values), latest = Math.max(...values);
    // An unqualified until phrase is an endpoint, not an invented starting interval.
    if (/\buntil\b/.test(text) && values.length === 1) earliest = latest = values[0];
    return { earliest: earliest - widenedBy, latest: latest + widenedBy, interval, approximate, widenedBy };
}

export function alignClockRanges(a, b, config = SCORING_CONFIG) {
    // Midnight's 0 AM and end-of-day spellings represent the same nearby boundary.
    if (a.latest < config.midnightAlignmentWindow && b.earliest > config.minutesPerDay - config.midnightAlignmentWindow) a = { ...a, earliest: a.earliest + config.minutesPerDay, latest: a.latest + config.minutesPerDay };
    if (b.latest < config.midnightAlignmentWindow && a.earliest > config.minutesPerDay - config.midnightAlignmentWindow) b = { ...b, earliest: b.earliest + config.minutesPerDay, latest: b.latest + config.minutesPerDay };
    return [a, b];
}

const words = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100, thousand:1000 };
export function parseQuantityRange(phrase, config = SCORING_CONFIG) {
    const text = normalize(phrase);
    if (!text || /\b(?:am|pm|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(text)) return null;
    const numberPattern = new RegExp(`\\b(?:\\d+(?:\\.\\d+)?|(?:${Object.keys(words).join("|")})(?:[ -](?:${Object.keys(words).join("|")}))*)\\b`, "g");
    const matches = [...text.matchAll(numberPattern)];
    const values = matches.map(m => {
        if (/^\d/.test(m[0])) return Number(m[0]);
        let result = 0, group = 0;
        for (const word of m[0].split(/[ -]/)) {
            if (word === "hundred") group = (group || 1) * 100;
            else if (word === "thousand") { result += (group || 1) * 1000; group = 0; }
            else group += words[word];
        }
        return result + group;
    });
    if (!values.length || values.length > 2) return null;
    const approximate = /\b(?:about|around|roughly|approximately|maybe)\b/.test(text);
    const earliest = Math.min(...values), latest = Math.max(...values);
    const width = approximate ? Math.max(config.quantityToleranceMinimum, latest * config.quantityToleranceFraction) : 0;
    const unit = text.replace(numberPattern, "").replace(/\b(?:about|around|roughly|approximately|maybe|or|to|between|and)\b/g, "").replace(/[-\s]+/g, " ").trim();
    return { earliest: Math.max(0, earliest - width), latest: latest + width, widenedBy: width, unit };
}

export function contextFor(fact1, fact2, provided = {}) {
    const texts = [fact1, fact2].map(f => normalize(`${f.context ?? ""} ${f.original}`));
    const anchors = t => t.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:january|february|march|april|may|june|july|august|september|october|november|december) \d+(?:st|nd|rd|th)?(?:,? \d{4})?)\b/g) ?? [];
    const a = anchors(texts[0]), b = anchors(texts[1]);
    const sharedAnchor = a.some(x => b.includes(x));
    const mismatch = a.length > 0 && b.length > 0 && !sharedAnchor;
    const restricted = texts.map(t => /\b(?:before|after|since)\b/.test(t));
    return { ...provided, text1: texts[0], text2: texts[1],
        sameEvent: fact1.ambiguousSource || fact2.ambiguousSource ? false : provided.sameEvent ?? sharedAnchor,
        mismatch: provided.mismatch ?? mismatch,
        asymmetricKnowledgeScope: restricted[0] !== restricted[1] && !provided.sameEvent,
        personMismatch: Boolean(fact1.person && fact2.person && normalize(fact1.person) !== normalize(fact2.person)) };
}
