import { SCORING_CONFIG } from "./config.js";
import { normalize, clauses, parseTimeRange, alignClockRanges, parseQuantityRange, overlaps } from "./parsers.js";

const result = (id, fieldsUsed, explanation, extra = {}) => ({ id, applicable:false, verdict:"UNKNOWN", strength:0, basis:"EXPLICIT", fieldsUsed, explanation, ...extra });
const unknown = (id, fields, explanation, reason = "UNSUPPORTED_PATTERN") => result(id, fields, explanation, { reason });
const verified = (id, fields, verdict, explanation, config, extra = {}) => result(id, fields, explanation, { applicable:true, verdict,
    strength: verdict === "CONFLICT" ? config.explicitStrength : 0, ...extra });
const clauseWith = (fact, pattern) => clauses(fact.original).find(c => pattern.test(normalize(c.text)))?.text.trim() ?? null;
const blocked = (context) => context.mismatch || context.personMismatch;
const timeOf = (fact, context, side, config) => {
    if (!fact.time) return null;
    // Include only value qualifiers from the clause containing the extracted time.
    const clause = clauses(fact.original).find(c => normalize(c.text).includes(normalize(fact.time)));
    const valueQualifiers = clause?.text.match(/\b(?:around|about|roughly|approximately|maybe|perhaps)\b/gi) ?? [];
    return parseTimeRange(`${valueQualifiers.join(" ")} ${fact.time}`, { text: context[`text${side}`], period:context.period }, config);
};
const gapStrength = (gap, fullGap, config) => Math.min(config.explicitStrength, config.minimumConflictStrength + (config.explicitStrength - config.minimumConflictStrength) * gap / fullGap);
const clock = value => {
    const hour = Math.floor(value / 60), minute = Math.round(value % 60);
    return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
};
const limitRange = (range, phrase, isTime = false) => range?.widenedBy ? [`Range widened by qualifiers near '${phrase}' to ${isTime ? clock(range.earliest) : range.earliest}–${isTime ? clock(range.latest) : range.latest} (${range.widenedBy} each side${isTime ? " in minutes" : ""}).`] : [];

function timeRange(f1, f2, context, config) {
    const id = "time", fields = ["time"];
    if (!f1.time || !f2.time) return unknown(id,fields,"Two clock phrases are needed.");
    if (blocked(context) || !context.sameEvent) return unknown(id,fields,"Clock comparisons need the same person and source event/day anchor.","MISSING_CONTEXT");
    if (f1.activity && f2.activity && normalize(f1.activity) !== normalize(f2.activity)) return unknown(id,fields,"Different activities do not assert two times for the same event.");
    if (f1.state && f2.state && normalize(f1.state) !== normalize(f2.state)) return unknown(id,fields,"Different states may occur at different times; compare their temporal overlap instead.");
    let a = timeOf(f1,context,1,config), b = timeOf(f2,context,2,config);
    if (a?.missing || b?.missing) return unknown(id,fields,"AM/PM is unresolved.","MISSING_CONTEXT");
    if (!a || !b || a.interval || b.interval) return unknown(id,fields,"This rule compares event-time ranges; continuous intervals need a timeline rule.");
    [a,b] = alignClockRanges(a,b,config);
    const compatible = overlaps(a,b), gap = compatible ? 0 : Math.max(a.earliest-b.latest,b.earliest-a.latest);
    return verified(id,fields,compatible ? "COMPATIBLE" : "CONFLICT", compatible ? "The independently widened time ranges overlap." : `Time ranges do not overlap; remaining gap is ${gap} minutes.`,config,
        { strength: compatible ? 0 : gapStrength(gap,config.timeGapForFullStrength,config), basis:"DERIVED", ranges:[a,b], target1:f1.time,target2:f2.time, limits:[...limitRange(a,f1.time,true),...limitRange(b,f2.time,true)] });
}

function stateExclusivity(f1,f2,context,config) {
    const id="state", fields=["state","time"];
    if (!f1.state || !f2.state) return unknown(id,fields,"Two explicit states are needed.");
    if (blocked(context) || !context.sameEvent) return unknown(id,fields,"State exclusivity needs a shared time/event anchor.","MISSING_CONTEXT");
    const state = f => normalize(f.state).replace(/^(?:was|were|is|i was)\s+/, "");
    const a=state(f1),b=state(f2);
    const family = [ ["asleep","awake"],["present","absent"],["open","closed"],["alive","dead"] ].find(pair=>pair.includes(a)&&pair.includes(b));
    if (!family) return unknown(id,fields,"The states are outside the supported exclusivity families.");
    let t1=timeOf(f1,context,1,config),t2=timeOf(f2,context,2,config);
    if (!t1 || !t2 || t1.missing || t2.missing) return unknown(id,fields,"Both state time ranges must be resolved.","MISSING_CONTEXT");
    [t1,t2]=alignClockRanges(t1,t2,config);
    if (!overlaps(t1,t2)) return verified(id,fields,"COMPATIBLE","The states occur at non-overlapping times.",config,{target1:f1.state,target2:f2.state});
    return verified(id,fields,a===b?"COMPATIBLE":"CONFLICT",a===b?"The states agree.":"Mutually exclusive explicit states overlap in time.",config,{basis:"DERIVED",strength:a===b?0:config.derivedStrength,target1:f1.state,target2:f2.state});
}

function timeline(f1,f2,context,config) {
    const id="timeline",fields=["time","location","activity","state"];
    const candidates=[[f1,f2,1,2],[f2,f1,2,1]];
    for (const [continuous,other,side,otherSide] of candidates) {
        const interval=timeOf(continuous,context,side,config),point=timeOf(other,context,otherSide,config);
        if (!interval?.interval || !point || point.missing) continue;
        if (blocked(context)||!context.sameEvent) return unknown(id,fields,"Timeline conflicts need the same person and event/day.","MISSING_CONTEXT");
        const a=normalize(continuous.original),b=normalize(other.original);
        const sleep=/\b(?:asleep|slept|sleeping)\b/.test(a)&&/\b(?:continuously|throughout|from)\b/.test(a)&&/\b(?:awake|watching|watched)\b/.test(b);
        const location1=normalize(continuous.location),location2=normalize(other.location);
        const attended=/\b(?:attended|was at|was in|went to|visited)\b/.test(b)&&!/\b(?:scheduled|planned|appointment was)\b/.test(b);
        const locationConflict=location1&&location2&&location1!==location2&&/\b(?:from|throughout|continuously)\b/.test(a)&&attended;
        if (!sleep&&!locationConflict) continue;
        if (/\b(?:not|never|didn't|wasn't|weren't)\b/.test(b)||/\b(?:except|woke|returned)\b/.test(a)) return unknown(id,fields,"An exception or negation prevents verifying continuity.");
        const [t1,t2]=alignClockRanges(interval,point,config);
        const positive=overlaps(t1,t2);
        return verified(id,fields,positive?"CONFLICT":"COMPATIBLE",positive?"Explicit continuous interval overlaps an incompatible witnessed activity/location.":"The interval and activity do not overlap.",config,{basis:"DERIVED",strength:positive?config.derivedStrength:0,target1:side===1?(continuous.state??continuous.location??continuous.time):(other.activity??other.state??other.location),target2:side===1?(other.activity??other.state??other.location):(continuous.state??continuous.location??continuous.time)});
    }
    return unknown(id,fields,"No supported continuous-interval incompatibility was found.");
}

function polarity(text) {
    const value=normalize(text).replace(/[.!?]+$/," ").replace(/^i\s+/,"").replace(/\b(?:i think|i believe|i don't remember whether|i do not remember whether|might have|may have|have|had)\b/g," ").trim();
    const m=value.match(/^(never |did not |didn't |do not |don't )?(signed|sign|entered|enter|left|leave|met|meet|visited|visit|called|call|went|go)\s+(.+)$/);
    if(!m)return null;
    const bases={signed:"sign",entered:"enter",left:"leave",met:"meet",visited:"visit",called:"call",went:"go"};
    return { action:`${bases[m[2]]??m[2]} ${m[3].trim()}`,negative:Boolean(m[1]) };
}
function activityPolarity(f1,f2,context,config) {
    const id="activity polarity",fields=["activity"];
    const a=polarity(f1.activity),b=polarity(f2.activity);
    if(!a||!b||a.action!==b.action)return unknown(id,fields,"Activity and object must match after supported verb normalization.");
    if(blocked(context))return unknown(id,fields,"Person or event scopes differ.","MISSING_CONTEXT");
    if ((f1.time||f2.time)&&!context.sameEvent)return unknown(id,fields,"Time-scoped activity needs a shared event.","MISSING_CONTEXT");
    return verified(id,fields,a.negative!==b.negative?"CONFLICT":"COMPATIBLE","Compared the same action/object with whole-word polarity.",config,{target1:f1.activity,target2:f2.activity});
}

function locationActivity(f1,f2,context,config) {
    const id="location+activity",fields=["location","activity"];
    const homePattern=/\b(?:at home|stayed home|was home|never left (?:the house|home))\b/;
    const exitPattern=/\b(?:went out|stepped out|left (?:the house|home)|leave (?:the house|home))\b/;
    for(const [home,out,reversed] of [[f1,f2,false],[f2,f1,true]]){
        const homeClause=clauseWith(home,homePattern),exitClause=clauseWith(out,exitPattern);
        if(!homeClause||!exitClause)continue;
        const h=normalize(homeClause),e=normalize(exitClause);
        if(!/\b(?:all|entire|whole|throughout|never)\b/.test(h)||/\b(?:except|mostly)\b/.test(h))continue;
        if(/\b(?:never|not|didn't|don't|did not|do not)\b/.test(e)) {
            if(/\b(?:remember|recall)\b/.test(e)&&/\bwhether\b/.test(e)) { /* uncertainty affects commitment, not lexical polarity */ }
            else return verified(id,fields,"COMPATIBLE","Negated departure does not contradict remaining home.",config,{target1:reversed?exitClause:homeClause,target2:reversed?homeClause:exitClause});
        }
        if(blocked(context))return unknown(id,fields,"The source dates or person references differ.","MISSING_CONTEXT");
        // Broad evening and explicit morning do not overlap.
        if(/\bevening\b/.test(h)&&/(?:\d\s*am\b|\bmorning\b)/.test(normalize(out.time??out.original)))return verified(id,fields,"COMPATIBLE","The departure is outside the claimed evening.",config,{target1:reversed?exitClause:homeClause,target2:reversed?homeClause:exitClause});
        if(/\b(?:today|tomorrow|yesterday)\b/.test(h+" "+e)&&!context.sameEvent)return unknown(id,fields,"Relative days need a shared source anchor.","MISSING_CONTEXT");
        return verified(id,fields,"CONFLICT","Explicit uninterrupted home presence excludes the stated departure within the compared account.",config,{target1:reversed?exitClause:homeClause,target2:reversed?homeClause:exitClause});
    }
    return unknown(id,fields,"No supported uninterrupted-home/departure pattern.");
}

function knowledgeParts(fact) {
    const out=[];
    for(const clause of clauses(fact.original)){
        const text=normalize(clause.text);
        const family=/\b(?:heard of|knew of|know of|knew him|knew her|know him|know her)\b/.test(text)?"awareness":/\b(?:met|meet)\b/.test(text)?"meeting":null;
        if(!family)continue;
        if(/\b(?:don't think|do not think)\b/.test(text))continue;
        const negative=/\b(?:never|not|didn't|don't|did not|do not)\b/.test(text)&&!/\b(?:remember|recall)\b/.test(text);
        out.push({family,negative,target:clause.text.trim()});
    }
    return out;
}
function knowledge(f1,f2,context,config){
    const id="knowledge",fields=["activity","person"];
    for(const a of knowledgeParts(f1))for(const b of knowledgeParts(f2)){
        if(a.family!==b.family)continue;
        if(blocked(context)||context.asymmetricKnowledgeScope)return unknown(id,fields,"Knowledge/contact needs aligned person and temporal scope.","MISSING_CONTEXT");
        return verified(id,fields,a.negative!==b.negative?"CONFLICT":"COMPATIBLE",`Compared ${a.family} polarity; awareness and meeting are distinct families.`,config,{target1:a.target,target2:b.target});
    }
    return unknown(id,fields,"No comparable knowledge/contact family.");
}
function quantity(f1,f2,context,config){
    const id="quantity",fields=["quantity","object"];
    const a=parseQuantityRange(f1.quantity,config),b=parseQuantityRange(f2.quantity,config);
    if(!a||!b)return unknown(id,fields,"Two supported numeric/number-word amounts are needed.");
    if(blocked(context)||a.unit!==b.unit||(f1.object&&f2.object&&normalize(f1.object)!==normalize(f2.object)))return unknown(id,fields,"Quantity referents, units or event scopes differ.","MISSING_CONTEXT");
    const positive=!overlaps(a,b),gap=positive?Math.max(a.earliest-b.latest,b.earliest-a.latest):0;
    return verified(id,fields,positive?"CONFLICT":"COMPATIBLE",positive?`Quantity ranges do not overlap; remaining gap is ${gap}.`:"Quantity ranges overlap.",config,{basis:"DERIVED",strength:positive?gapStrength(gap,config.quantityGapForFullStrength,config):0,target1:f1.quantity,target2:f2.quantity,limits:[...limitRange(a,f1.quantity),...limitRange(b,f2.quantity)],ranges:[a,b]});
}

export const RULE_REGISTRY = [timeRange,stateExclusivity,timeline,activityPolarity,locationActivity,knowledge,quantity];
export function evaluateRules(fact1,fact2,context,config=SCORING_CONFIG){
    return RULE_REGISTRY.map(rule=>rule(fact1,fact2,context,config));
}
