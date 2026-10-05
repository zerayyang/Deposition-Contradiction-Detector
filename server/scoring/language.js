import { SCORING_CONFIG } from "./config.js";
import { clauses, normalize } from "./parsers.js";

const phrases = {
    certainty:["i know for certain","i clearly remember","i distinctly remember","definitely","certainly","always","never","all","absolutely"],
    memory:["i don't remember exactly","i have no independent recollection","i don't remember","i do not remember","i can't recall","i do not recall","i'm not sure","i vaguely remember","i don't recall"],
    hedge:["i don't think","i think not","i think","i believe","i suppose","could have","might","maybe","perhaps","possibly","probably","i guess","i assume","may"],
    approximation:["approximately","give or take","roughly","around","about","or so"],
    habitual:["generally","typically","usually","normally"],
    secondHand:["someone told me","i was told","i learned later","i heard afterward"],
    inference:["i inferred","i assumed","i concluded"],
    reaffirmation:["as i testified previously","i stand by my prior testimony"],
    correction:["i need to correct my earlier testimony","what i meant was","i misspoke"],
};
export function analyzeCommitment(fact, targets=[], config=SCORING_CONFIG){
    const text=fact.original, normalized=normalize(text);
    const segments=clauses(text);
    const targetRanges=targets.filter(Boolean).flatMap(target=>{
        const needle=normalize(target),index=normalized.indexOf(needle);
        return index<0?[]:[{start:index,end:index+needle.length}];
    });
    const values=[fact.time,fact.quantity].filter(Boolean).map(value=>{
        const index=normalized.indexOf(normalize(value));
        return {start:index,end:index+value.length};
    }).filter(r=>r.start>=0);
    const entries=Object.entries(phrases).flatMap(([category,list])=>list.map(phrase=>({category,phrase}))).sort((a,b)=>b.phrase.length-a.phrase.length);
    const consumed=[],applied=[],ignored=[];
    let bonus=0,penalty=0,adjustment=0,penaltyCount=0,certaintyCount=0;
    for(const entry of entries){
        const escaped=entry.phrase.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        for(const match of normalized.matchAll(new RegExp(`(?<!\\w)${escaped}(?!\\w)`,"g"))){
            const start=match.index,end=start+match[0].length;
            if(consumed.some(r=>start<r.end&&end>r.start))continue;
            consumed.push({start,end});
            const phrase=text.slice(start,end),segment=segments.find(c=>start>=c.start&&start<c.end);
            const inTarget=segment&&targetRanges.some(r=>r.start<segment.end&&r.end>segment.start);
            const nearValue=values.some(r=>start<=r.end&&end>=r.start-1 || (segment&&r.start>=segment.start&&r.end<=segment.end&& Math.min(Math.abs(end-r.start),Math.abs(start-r.end))<=config.qualifierValueDistance));
            const valueScope=(entry.category==="approximation"||["maybe","perhaps","possibly"].includes(entry.phrase))&&nearValue;
            if(entry.phrase==="may"&&(/^May$/.test(phrase)||/\bmay\s+\d/.test(normalized.slice(start)))){
                ignored.push({phrase,scope:"UNRELATED",effect:0,explanation:"Calendar month is not a modal hedge."});continue;
            }
            if(valueScope){applied.push({phrase,scope:"VALUE",effect:0,explanation:"Value approximation widens its range; no second commitment penalty."});continue;}
            if(!inTarget){ignored.push({phrase,scope:"UNRELATED",effect:0,explanation:"Qualifier modifies another clause or an unscored fact."});continue;}
            if(entry.category==="approximation"){ignored.push({phrase,scope:"UNRELATED",effect:0,explanation:"Approximation is not an assertion commitment penalty."});continue;}
            let effect;
            if(entry.category==="certainty"){
                effect=Math.min(config.certaintyCap-bonus,config.certaintyBonus*config.diminishingFactor**certaintyCount++);bonus+=effect;
            }else if(entry.category==="reaffirmation"||entry.category==="correction"){
                effect=entry.category==="reaffirmation"?config.reaffirmationBonus:-config.correctionPenalty;
                const next=Math.max(-config.correctionReaffirmationCap,Math.min(config.correctionReaffirmationCap,adjustment+effect));effect=next-adjustment;adjustment=next;
            }else{
                const weight={memory:config.memoryPenalty,hedge:config.hedgePenalty,habitual:config.habitualPenalty,secondHand:config.secondHandPenalty,inference:config.inferencePenalty}[entry.category];
                effect=-Math.min(config.assertionPenaltyCap-penalty,weight*config.diminishingFactor**penaltyCount++);penalty-=effect;
            }
            applied.push({phrase,scope:"ASSERTION",effect,explanation:`${entry.category} modifies the compared assertion.`});
        }
    }
    return { commitment:Math.max(config.commitmentFloor,Math.min(config.commitmentCeiling,config.commitmentBaseline+bonus-penalty+adjustment)),applied,ignored };
}
