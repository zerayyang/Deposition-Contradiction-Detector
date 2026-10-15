import * as chrono from 'chrono-node';

// Parser reference only: never a deposition date or a source fact.
const reference={instant:new Date('2026-01-15T12:00:00Z'),timezone:0};
const fields=['year','month','day','weekday','hour','minute','second','meridiem','timezoneOffset'];
const serialize=part=>part?Object.fromEntries(fields.map(field=>[field,{
    value:part.get(field),knownByChrono:part.isCertain(field)
}])):null;

// Observational output only. No numeric output here is an input to scoreFacts.
export function interpretValidatedTime(fact,verified) {
    const output={parser:'chrono-node',usedForScoring:false,
        reference:{instant:reference.instant.toISOString(),timezone:0,synthetic:true},
        phrase:verified?fact.time??null:null,matches:[],
        notice:'Known by Chrono is not independently verified testimony or a confidence percentage. Approximation, negation, bounds and event identity require separate rules.'};
    if(!verified)return {...output,status:'UNVERIFIED_SOURCE'};
    if(fact.ambiguousSource)return {...output,status:'AMBIGUOUS_SOURCE'};
    if(!fact.time)return {...output,status:'MISSING_PHRASE'};
    // Keep limits explicit and avoid expensive parsing of an entire long answer.
    if(fact.time.length>2000)return {...output,status:'INPUT_TOO_LONG'};
    try {
        const results=chrono.parse(fact.time,reference);
        output.matches=results.map(result=>({matchedText:result.text,index:result.index,
            start:serialize(result.start),end:serialize(result.end)}));
        // Expose meaningful text not consumed by Chrono, including "before" or
        // "around". A partial clock match must not look like full interpretation.
        let remainder='',cursor=0;
        for(const result of [...results].sort((a,b)=>a.index-b.index)){
            remainder+=fact.time.slice(cursor,result.index);
            cursor=Math.max(cursor,result.index+result.text.length);
        }
        remainder+=fact.time.slice(cursor);
        output.unmatchedText=remainder;
        return {...output,status:!results.length?'NO_MATCH':/[\p{L}\p{N}]/u.test(remainder)?'PARTIAL_MATCH':'PARSED'};
    }catch{
        // An auxiliary parser must not discard the candidate or break analysis.
        return {...output,status:'PARSER_ERROR'};
    }
}

// Logs omit literal phrases; detailed matches are visible only in the response.
export function summarizeChronoTime(analyses) {
    return Object.entries(analyses).map(([side,result])=>({side,status:result.status,
        matches:result.matches.length,usedForScoring:false,
        impliedMeridiems:result.matches.filter(m=>m.start.meridiem.value!==null&&!m.start.meridiem.knownByChrono).length}));
}
