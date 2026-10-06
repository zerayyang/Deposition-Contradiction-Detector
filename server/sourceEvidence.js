// Preserve literal offsets. In Q/A transcripts, only answer spans are evidence.
export function witnessQuoteMatches(transcript, quote) {
    if (typeof transcript !== "string" || typeof quote !== "string" || !quote) return [];
    const markers = [...transcript.matchAll(/^[ \t]*(?:\d+[ \t]+)?(QUESTION|ANSWER|Q|A)[.:][ \t]*/gim)];
    const answers = [];
    const questions = [];
    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const start = marker.index + marker[0].length;
        const end = markers[i + 1]?.index ?? transcript.length;
        if (/^(?:Q|QUESTION)$/i.test(marker[1])) {
            questions.push(transcript.slice(start, end).trim());
        } else {
            answers.push({start, end, questions:[...questions]});
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
