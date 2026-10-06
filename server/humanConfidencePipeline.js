import { validateClaim } from "./evidenceValidator.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { scoreFacts } from "./scoring/engine.js";
import { witnessQuoteMatches } from "./sourceEvidence.js";

function sourceContext(transcript, quote) {
    const matches = witnessQuoteMatches(transcript, quote);
    // Multiple answer occurrences have no unambiguous question anchor.
    if (matches.length !== 1) return {text:"", statement:"", ambiguous:matches.length > 1};
    const { questions: precedingQuestions, statement } = matches[0];
    // An explicit topic/event reset cannot inherit an earlier date or daypart.
    const resetIndex=precedingQuestions.findLastIndex(q=>/\b(?:another|different|separate)\s+(?:occasion|day|event|incident|matter)\b|\bunrelated matter\b/i.test(q));
    const questions=precedingQuestions.slice(Math.max(0,resetIndex));
    const current = questions.at(-1) ?? "";
    // Carry only explicitly stated event/daypart anchors from preceding questions.
    const dateAnchor = questions.findLast(q => /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(q));
    const periodAnchor = questions.findLast(q => /\b(?:evening|night|morning|afternoon)\b/i.test(q));
    return {text:[...new Set([dateAnchor,periodAnchor,current].filter(Boolean))].join(" "), statement, ambiguous:false};
}

// Orchestration preserves model metadata, but passes only validated literal facts to scoring.
export function assessCandidate(candidate, transcript1, transcript2) {
    if (!candidate || typeof candidate !== "object" ||
        !["DIRECT", "INFERENTIAL", "FALSE_POSITIVE"].includes(candidate.type)) {
        throw new Error("Invalid candidate classification in model response");
    }
    const claim1Valid = validateClaim(candidate.claim1, transcript1);
    const claim2Valid = validateClaim(candidate.claim2, transcript2);
    const fact1 = new TestimonyFact(claim1Valid ? candidate.claim1 : { original:"",qualifierPhrases:[] });
    const fact2 = new TestimonyFact(claim2Valid ? candidate.claim2 : { original:"",qualifierPhrases:[] });
    for (const [fact, valid, transcript, claim] of [[fact1,claim1Valid,transcript1,candidate.claim1],[fact2,claim2Valid,transcript2,candidate.claim2]]) {
        const source = valid ? sourceContext(transcript, claim.original) : {text:"",statement:"",ambiguous:false};
        fact.context = source.text;
        fact.sourceStatement = source.statement;
        fact.ambiguousSource = source.ambiguous;
    }
    const verified = claim1Valid && claim2Valid;
    const index = scoreFacts(fact1, fact2);
    if (!verified) Object.assign(index, {score:null,band:"NOT_EVALUABLE",status:"NOT_EVALUABLE",
        notEvaluableReason:"UNVERIFIED_SOURCE",evidenceStrength:null,rulesFired:[],rulesLimiting:[{id:"grounding",explanation:"Quote or extracted phrase failed exact source validation."}]});
    const review = !verified || index.status === "NOT_EVALUABLE";
    return {...candidate, ...index, claim1Valid,claim2Valid,
        humanConfidence:index.score, evidenceScore:index.evidenceStrength,
        evidenceDetails:index.rulesFired.map(r=>({rule:r.id,score:r.strength,verdict:r.verdict})),
        languageScore:index.commitment.pair,
        evidenceCoverage:index.factsCompared.total ? index.factsCompared.compared / index.factsCompared.total : 0,
        coverageCapped:false,coverageCap:null,basis:verified ? index.status : "UNVERIFIED",
        comparisons:Object.fromEntries(index.rulesFired.map(r=>[r.id,r.verdict])),
        flag:review ? "REVIEW" : "NONE",
        reasons:review ? [!verified ? "Source evidence is unverified." : `Not evaluable by code rules: ${index.notEvaluableReason}.`] : []};
}
