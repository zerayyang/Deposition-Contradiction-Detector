import { testimonyMarkers } from './testimonyMarkers.js';
// Preserve literal offsets. In Q/A transcripts, only answer spans are evidence.
export function witnessQuoteMatches(transcript, quote) {
    if (typeof transcript !== "string" || typeof quote !== "string" || !quote) return [];
    const markers = testimonyMarkers(transcript);
    const answers = [];
    const questions = [];
    let question = null;
    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const start = marker.contentStart;
        const end = markers[i + 1]?.index ?? transcript.length;
        if (marker.role === "Q") {
            question = {start, end, text:transcript.slice(start, end).trim()};
            questions.push(question.text);
        } else if (marker.role === "A") {
            answers.push({start, end, question, questions:[...questions]});
        }
    }
    // Plain witness-text input remains supported without inventing question context.
    if (!markers.length) answers.push({start:0, end:transcript.length, questions:[]});
    const matches = [];
    for (let index = transcript.indexOf(quote); index >= 0; index = transcript.indexOf(quote, index + quote.length)) {
        const answer = answers.find(span => index >= span.start && index + quote.length <= span.end);
        if (!answer) continue;
        const before = transcript.slice(answer.start, index);
        const priorEnd = [...before.matchAll(/[.!?](?=\s|$)/g)].at(-1);
        const statementStart = priorEnd ? answer.start + priorEnd.index + 1 : answer.start;
        const quoteEnd = index + quote.length;
        const tailEnd = /[.!?]["']?\s*$/.test(quote) ? null : transcript.slice(quoteEnd, answer.end).match(/[.!?](?=\s|$)/);
        const statementEnd = /[.!?]["']?\s*$/.test(quote) ? quoteEnd : tailEnd ? quoteEnd + tailEnd.index + 1 : answer.end;
        matches.push({...answer, index, statement:transcript.slice(statementStart, statementEnd).trim()});
    }
    return matches;
}

// Literal anchors identify an occurrence, never a semantic guess from reasoning.
// PDF normalization is allowed only through the verified reporting-layout map.
function containsAnchor(text, anchor, start, end, map) {
    if (text.slice(start,end).includes(anchor)) return true;
    if (!map) return false;
    const needle=anchor.replace(/\s+/g,' ').trim();
    if(!needle)return false;
    for(let at=map.normalized.indexOf(needle);at>=0;at=map.normalized.indexOf(needle,at+1)) {
        if(map.starts[at]>=start&&map.ends[at+needle.length-1]<=end)return true;
    }
    return false;
}
export function resolveWitnessSource(transcript, claim, options={}) {
    const start=options.start??0,end=options.end??transcript.length;
    const matches=witnessQuoteMatches(transcript,claim?.original).filter(m=>m.index>=start&&m.index+claim.original.length<=end);
    let eligible;
    const anchors=['sourceQuestion','sourceAnswer'].filter(k=>claim?.[k]!==null&&claim?.[k]!==undefined);
    if(anchors.some(k=>typeof claim[k]!=='string'||!claim[k].trim()))eligible=[];
    else eligible=matches.filter(m=>anchors.every(k=>k==='sourceQuestion'
        ? m.question&&containsAnchor(transcript,claim[k],m.question.start,m.question.end,options.map)
        : containsAnchor(transcript,claim[k],m.start,m.end,options.map)&&(claim[k].includes(claim.original)||options.map&&answerAnchorCoversQuote(claim[k],claim.original,options.map,transcript,m))));
    const status=!matches.length?'NOT_FOUND':!eligible.length?'ANCHOR_MISMATCH':eligible.length===1?'BOUND':'AMBIGUOUS';
    const location=m=>({id:`witness:${m.index}:${m.index+claim.original.length}`,start:m.index,end:m.index+claim.original.length,
        answerStart:m.start,answerEnd:m.end,questionStart:m.question?.start??null,questionEnd:m.question?.end??null});
    const selected=status==='BOUND'?eligible[0]:null;
    return {status,method:anchors.length?'LITERAL_CONTEXT':'UNIQUE_WITNESS_QUOTE',matchCount:matches.length,
        eligibleCount:eligible.length,selected:selected?{...location(selected),question:selected.question?.text??'',answer:transcript.slice(selected.start,selected.end).trim()}:null,
        alternatives:(eligible.length?eligible:matches).map(location)};
}
function answerAnchorCoversQuote(anchor,quote,map,text,match) {
    if(anchor.includes(quote))return true;
    const needle=anchor.replace(/\s+/g,' ').trim();
    for(let at=map.normalized.indexOf(needle);at>=0;at=map.normalized.indexOf(needle,at+1)) {
        const start=map.starts[at],end=map.ends[at+needle.length-1];
        if(start>=match.start&&end<=match.end&&start<=match.index&&end>=match.index+quote.length&&text.slice(start,end).includes(quote))return true;
    }
    return false;
}
