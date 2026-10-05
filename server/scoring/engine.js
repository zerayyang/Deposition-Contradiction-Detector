import { SCORING_CONFIG } from "./config.js";
import { contextFor } from "./parsers.js";
import { evaluateRules } from "./rules.js";
import { analyzeCommitment } from "./language.js";

const fields=["activity","time","location","person","object","quantity","state"];
export function evidenceBand(score, config=SCORING_CONFIG){
    if(score===null)return "NOT_EVALUABLE";
    for(const [band,threshold] of Object.entries(config.bands))if(score>=threshold)return band;
    return "WEAK";
}

// Only literal validated facts and source-derived context are accepted here.
// No model classifications, severity, reasoning or semantic-assistance inputs.
export function scoreFacts(fact1,fact2,providedContext={},config=SCORING_CONFIG){
    const context=contextFor(fact1,fact2,providedContext);
    const evaluations=evaluateRules(fact1,fact2,context,config);
    const applicable=evaluations.filter(r=>r.applicable);
    const conflicts=applicable.filter(r=>r.verdict==="CONFLICT");
    const winner=conflicts.reduce((best,r)=>!best||r.strength>best.strength?r:best,null);
    const status=winner?"CONFLICT_SUPPORTED":applicable.length?"COMPATIBLE_SUPPORTED":"NOT_EVALUABLE";
    const active=winner?[winner]:applicable;
    const claim1=analyzeCommitment(fact1,active.map(r=>r.target1),config);
    const claim2=analyzeCommitment(fact2,active.map(r=>r.target2),config);
    const pair=Math.min(claim1.commitment,claim2.commitment);
    const evidenceStrength=winner?.strength??(applicable.length?0:null);
    // The mix and band thresholds are uncalibrated placeholders pending owner labels.
    const score=status==="NOT_EVALUABLE"?null:status==="CONFLICT_SUPPORTED"?
        Math.round(100*evidenceStrength*(config.evidenceMix+config.commitmentMix*pair)):
        Math.round(100*config.compatibleCeiling*pair);
    const factsPresent=fields.some(field=>fact1[field]||fact2[field]);
    const notEvaluableReason=status!=="NOT_EVALUABLE"?null:!factsPresent&&!/\b(?:heard|knew|met|home|left|out)\b/i.test(`${fact1.original} ${fact2.original}`)?"NO_FACTS":evaluations.some(r=>r.reason==="MISSING_CONTEXT")?"MISSING_CONTEXT":"UNSUPPORTED_PATTERN";
    const rulesFired=applicable.map(({target1,target2,...r})=>{void target1;void target2;return r;});
    const rulesLimiting=[
        ...evaluations.filter(r=>!r.applicable&&r.reason==="MISSING_CONTEXT").map(r=>({id:r.id,explanation:r.explanation})),
        ...active.flatMap(r=>(r.limits??[]).map(explanation=>({id:r.id,explanation}))),
        ...[claim1,claim2].flatMap((c,index)=>[...c.applied.filter(x=>x.effect<0).map(x=>({id:"commitment",explanation:`Claim ${index+1}: '${x.phrase}' reduces commitment of the compared assertion.`})),...c.ignored.map(x=>({id:"ignored-language",explanation:`Claim ${index+1}: ignored '${x.phrase}': ${x.explanation}`}))])
    ];
    const present=new Set(fields.filter(field=>fact1[field]||fact2[field]));
    const compared=new Set(applicable.flatMap(r=>r.fieldsUsed).filter(field=>present.has(field)));
    return {score,band:evidenceBand(score,config),status,notEvaluableReason,evidenceStrength,
        commitment:{claim1:claim1.commitment,claim2:claim2.commitment,pair},rulesFired,rulesLimiting,
        languageDetails:{claim1:{applied:claim1.applied,ignored:claim1.ignored},claim2:{applied:claim2.applied,ignored:claim2.ignored}},
        factsCompared:{compared:compared.size,total:present.size},configVersion:config.version};
}
