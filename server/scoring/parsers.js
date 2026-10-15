import { dateScope, stripDates } from "./temporal.js";
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
    // Normalize clock notation internally; literal evidence stays untouched.
    const text = normalize(stripDates(phrase)).replace(/\b([ap])(?:\s*\.\s*|\s+)m\.?(?!\w)/g, "$1m");
    if (!text || /\d[/-]\d/.test(text) || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(text) || /\b\d+\s*(?:seconds?|minutes?|hours?|days?|years?)\b/.test(text)) return null;
    const named = /\bafternoon\b/.test(text) ? config.afternoonRange : /\bevening\b/.test(text) ? config.eveningRange : /\bmorning\b/.test(text) ? config.morningRange : null;
    const tokens = [...text.matchAll(/\b(?:midnight|noon)\b|\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?\b/g)];
    if (!tokens.length) return named ? { earliest: named[0], latest: named[1], interval: true, approximate: false, widenedBy: 0 } : null;
    // A trailing explicit period in an interval also qualifies its earlier endpoint.
    const explicitPeriods = [...text.matchAll(/(?:\d)\s*(am|pm)\b/g)].map(m => m[1]);
    const uniquePeriod = new Set(explicitPeriods).size === 1 ? explicitPeriods[0] : null;
    const periodContext = normalize(context.period ?? context.text);
    const contextPeriods=new Set((periodContext.match(/\b(?:am|pm|morning|afternoon|evening|night|tonight)\b/g)??[])
        .map(word=>["am","morning"].includes(word)?"am":"pm"));
    const contextualPeriod=contextPeriods.size===1?[...contextPeriods][0]:null;
    const values = [];
    for (const token of tokens) {
        const t = token[0].trim();
        if (t === "midnight") { values.push(config.minutesPerDay); continue; }
        if (t === "noon") { values.push(12 * 60); continue; }
        const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
        if (!m) return null;
        let hour = Number(m[1]);
        // Only an immediately attached daypart qualifies this clock. Another
        // clause such as "it rained at night" cannot resolve an earlier "8".
        const suffix=text.slice(token.index+token[0].trimEnd().length);
        const daypart=suffix.match(/^\s+(?:at (night)|in the (morning|afternoon|evening))\b/);
        let attachedPeriod=null;
        if(daypart?.[1]){
            // Night spans midnight: 1–5 needs more context rather than forced PM.
            if(hour>=1&&hour<=5)return {missing:"AM_PM"};
            attachedPeriod=hour===12?"am":"pm";
        }else if(daypart?.[2])attachedPeriod=daypart[2]==="morning"?"am":"pm";
        if(m[3]&&attachedPeriod&&m[3]!==attachedPeriod)return null;
        const period = m[3] ?? attachedPeriod ?? uniquePeriod ?? contextualPeriod;
        if (hour >= 1 && hour <= 12 && !period) return { missing: "AM_PM" };
        if (period && hour > 12) return null;
        if (period === "pm" && hour < 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
        values.push(hour * 60 + Number(m[2] ?? 0));
    }
    const interval = /\b(?:from|until|through|between)\b|\d\s*(?:to|-)\s*\d/.test(text) && values.length > 1;
    if (interval && values.at(-1) < values[0]) values[values.length - 1] += config.minutesPerDay;
    const approximate = /\b(?:around|about|roughly|approximately|maybe|perhaps)\b|\bor so\b/.test(text);
    const widenedBy = approximate ? config.timeToleranceMinutes : 0;
    let earliest = Math.min(...values), latest = Math.max(...values);
    // An unqualified until phrase is an endpoint, not an invented starting interval.
    if (/\buntil\b/.test(text) && values.length === 1) earliest = latest = values[0];
    return { earliest: earliest - widenedBy, latest: latest + widenedBy, interval, approximate, widenedBy };
}

// Preserve parseTimeRange's conservative public contract. Only the event-clock
// comparison rule opts into these alternatives; other rules never get a guessed time.
export function parseClockAlternatives(phrase, context = {}, config = SCORING_CONFIG) {
    const resolved=parseTimeRange(phrase,context,config);
    if(!resolved)return null;
    if(!resolved.missing)return [resolved];
    const text=normalize(phrase);
    // Only one plain event clock, with supported approximation/trailing context.
    // Bounds, compound clock estimates and ranges need their own semantics.
    const simple=/^(?:(?:around|about|roughly|approximately|maybe|perhaps|probably|at)\s+)*\d{1,2}(?::\d{2})?(?:\s+(?:or so|that (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day)))?[.!?]?$/;
    if(!simple.test(text))return null;
    const alternatives=["am","pm"].map(period=>parseTimeRange(phrase,{...context,period},config));
    if(alternatives.some(r=>!r||r.missing||r.interval))return null;
    return alternatives;
}

export function alignClockRanges(a, b, config = SCORING_CONFIG) {
    // Midnight's 0 AM and end-of-day spellings represent the same nearby boundary.
    if (a.latest < config.midnightAlignmentWindow && b.earliest > config.minutesPerDay - config.midnightAlignmentWindow) a = { ...a, earliest: a.earliest + config.minutesPerDay, latest: a.latest + config.minutesPerDay };
    if (b.latest < config.midnightAlignmentWindow && a.earliest > config.minutesPerDay - config.midnightAlignmentWindow) b = { ...b, earliest: b.earliest + config.minutesPerDay, latest: b.latest + config.minutesPerDay };
    return [a, b];
}

export { parseQuantityRange } from "./quantities.js";

export function contextFor(fact1, fact2, provided = {}) {
    const texts = [fact1, fact2].map(f => normalize(`${f.context ?? ""} ${f.original}`));
    const anchors = t => t.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:january|february|march|april|may|june|july|august|september|october|november|december) \d+(?:st|nd|rd|th)?(?:,? \d{4})?)\b/g) ?? [];
    const a = anchors(texts[0]), b = anchors(texts[1]);
    const dates=texts.map(dateScope);
    // Calendar scope takes precedence over shared weekday words. Unknown year
    // remains blank, and multiple/invalid dates cannot establish a shared day.
    const hasCalendar=dates.some(d=>d.present);
    const sharedAnchor=hasCalendar?Boolean(dates[0].key&&dates[0].key===dates[1].key):a.some(x=>b.includes(x));
    const mismatch=hasCalendar?dates.every(d=>d.present)&&!sharedAnchor:a.length>0&&b.length>0&&!sharedAnchor;
    const restricted = texts.map(t => /\b(?:before|after|since)\b/.test(t));
    return { ...provided, text1: texts[0], text2: texts[1],
        sameEvent: fact1.ambiguousSource || fact2.ambiguousSource ? false : provided.sameEvent ?? sharedAnchor,
        mismatch: provided.mismatch ?? mismatch,
        asymmetricKnowledgeScope: restricted[0] !== restricted[1] && !provided.sameEvent,
        personMismatch: Boolean(fact1.person && fact2.person && normalize(fact1.person) !== normalize(fact2.person)) };
}
