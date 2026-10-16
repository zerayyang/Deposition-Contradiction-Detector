import { boundedQuestionContext } from "./sourceContext.js";
import { interpretValidatedTime } from "./chronoTime.js";
import { validateClaim } from "./evidenceValidator.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { scoreFacts } from "./scoring/engine.js";
import { witnessQuoteMatches, resolveWitnessSource } from "./sourceEvidence.js";

function sourceContext(transcript, quote, binding, options={}) {
    const matches = witnessQuoteMatches(transcript, quote, options).filter(m=>binding.status==='BOUND'&&m.index===binding.selected.start);
    // Multiple answer occurrences have no unambiguous question anchor.
    if (matches.length !== 1) return {text:"", statement:"", ambiguous:binding.status !== 'BOUND'};
    const { questions: precedingQuestions, statement } = matches[0];
    return {text:boundedQuestionContext(precedingQuestions), statement, ambiguous:false};
}

// Orchestration preserves model metadata, but passes only validated literal facts to scoring.
export function assessCandidate(candidate, transcript1, transcript2, sourceOptions={}) {
    if (!candidate || typeof candidate !== "object" ||
        !["DIRECT", "INFERENTIAL", "FALSE_POSITIVE"].includes(candidate.type)) {
        throw new Error("Invalid candidate classification in model response");
    }
    const sourceBindings={claim1:resolveWitnessSource(transcript1,candidate.claim1,sourceOptions.claim1),
        claim2:resolveWitnessSource(transcript2,candidate.claim2,sourceOptions.claim2)};
    const claim1LiteralValid=validateClaim(candidate.claim1, transcript1, sourceOptions.claim1),claim2LiteralValid=validateClaim(candidate.claim2, transcript2, sourceOptions.claim2);
    const claim1Valid = claim1LiteralValid&&!['NOT_FOUND','ANCHOR_MISMATCH'].includes(sourceBindings.claim1.status);
    const claim2Valid = claim2LiteralValid&&!['NOT_FOUND','ANCHOR_MISMATCH'].includes(sourceBindings.claim2.status);
    const fact1 = new TestimonyFact(claim1Valid ? candidate.claim1 : { original:"",qualifierPhrases:[] });
    const fact2 = new TestimonyFact(claim2Valid ? candidate.claim2 : { original:"",qualifierPhrases:[] });
    for (const [fact, valid, transcript, claim, binding, options] of [[fact1,claim1Valid,transcript1,candidate.claim1,sourceBindings.claim1,sourceOptions.claim1],[fact2,claim2Valid,transcript2,candidate.claim2,sourceBindings.claim2,sourceOptions.claim2]]) {
        const source = valid ? sourceContext(transcript, claim.original, binding, options) : {text:"",statement:"",ambiguous:false};
        fact.context = source.text;
        fact.sourceQuestion = binding.selected?.question ?? "";
        fact.sourceStatement = source.statement;
        fact.ambiguousSource = source.ambiguous;
    }
    const verified = claim1Valid && claim2Valid;
    const index = scoreFacts(fact1, fact2);
    if (!verified) Object.assign(index, {score:null,band:"NOT_EVALUABLE",status:"NOT_EVALUABLE",
        notEvaluableReason:"UNVERIFIED_SOURCE",evidenceStrength:null,rulesFired:[],rulesLimiting:[{id:"grounding",explanation:"Quote or extracted phrase failed exact source validation."}]});
    if(verified&&Object.values(sourceBindings).some(source=>source.status!=='BOUND'))index.notEvaluableReason='MISSING_CONTEXT';
    const review = !verified || index.status === "NOT_EVALUABLE";
    return {...candidate, ...index, claim1Valid,claim2Valid,claim1LiteralValid,claim2LiteralValid,sourceBindings,
        chronoTimeAnalysis:{claim1:interpretValidatedTime(fact1,claim1Valid),claim2:interpretValidatedTime(fact2,claim2Valid)},
        humanConfidence:index.score, evidenceScore:index.evidenceStrength,
        evidenceDetails:index.rulesFired.map(r=>({rule:r.id,score:r.strength,verdict:r.verdict})),
        languageScore:index.commitment.pair,
        evidenceCoverage:index.factsCompared.total ? index.factsCompared.compared / index.factsCompared.total : 0,
        coverageCapped:false,coverageCap:null,basis:verified ? index.status : "UNVERIFIED",
        comparisons:Object.fromEntries(index.rulesFired.map(r=>[r.id,r.verdict])),
        flag:review ? "REVIEW" : "NONE",
        reasons:review ? [!verified ? "Source evidence is unverified." : `Not evaluable by code rules: ${index.notEvaluableReason}.`] : []};
}
