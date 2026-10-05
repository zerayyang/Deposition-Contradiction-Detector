import { validateClaim } from "./evidenceValidator.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { scoreFacts } from "./scoring/engine.js";

function sourceContext(transcript, quote) {
    const index = transcript.indexOf(quote);
    if (index < 0 || transcript.indexOf(quote, index + quote.length) >= 0) return "";
    const prefix = transcript.slice(0, index);
    const questions = [...prefix.matchAll(/^Q:\s*(.*)$/gm)].map(match => match[1]);
    const current = questions.at(-1) ?? "";
    // Carry only explicitly stated event/daypart anchors from preceding questions.
    const dateAnchor = questions.findLast(q => /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(q));
    const periodAnchor = questions.findLast(q => /\b(?:evening|night|morning|afternoon)\b/i.test(q));
    return [...new Set([dateAnchor,periodAnchor,current].filter(Boolean))].join(" ");
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
    fact1.context = claim1Valid ? sourceContext(transcript1, candidate.claim1.original) : "";
    fact2.context = claim2Valid ? sourceContext(transcript2, candidate.claim2.original) : "";
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
