import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TestimonyFact } from "../TestimonyFact.js";
import { assessCandidate } from "../humanConfidencePipeline.js";
import { scoreFacts } from "./engine.js";
import { parseTimeRange } from "./parsers.js";
import { analyzeCommitment } from "./language.js";
import { SCORING_CONFIG } from "./config.js";

const gold=JSON.parse(readFileSync(new URL("./gold.json",import.meta.url),"utf8"));
const pair=id=>gold.find(r=>r.id===id);
const run=row=>scoreFacts(new TestimonyFact(row.claim1),new TestimonyFact(row.claim2),row.context);
const fired=(r,id)=>r.rulesFired.find(rule=>rule.id===id);
const claim=(original,fields={})=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[],...fields});
const home=pair("sample-home");
const homeTranscript=`Q: Where were you on the evening of November 3rd?\nA: ${home.claim1.original}`;
const outTranscript=`Q: Walk through the evening of November 3rd again.\nA: ${home.claim2.original}`;
let original=null;
for(const [i,type] of ["DIRECT","INFERENTIAL","FALSE_POSITIVE"].entries()){
    const scored=assessCandidate({claim1:home.claim1,claim2:home.claim2,type,
        severity:["HIGH","MEDIUM","LOW"][i],reasoning:`Opinion ${i}`,semanticAssist:{relationship:i?"MATCH":"UNRELATED"},confidence:i*50},homeTranscript,outTranscript);
    const subset=Object.fromEntries(["score","band","status","evidenceStrength","commitment","rulesFired","languageDetails"].map(k=>[k,scored[k]]));
    if(original)assert.deepEqual(subset,original);else original=subset;
    assert.equal(scored.type,type);
    assert.equal(scored.score,84);
}
const sleep=run(pair("sample-sleep"));
assert.equal(fired(sleep,"time").verdict,"CONFLICT");
assert.ok(fired(sleep,"time").strength>=0.7);
assert.equal(sleep.commitment.pair,SCORING_CONFIG.commitmentBaseline);
assert.ok(sleep.languageDetails.claim1.applied.every(x=>x.scope==="VALUE"));
const hedged=run(home),unhedged=run(pair("unhedged-home"));
assert.equal(fired(hedged,"location+activity").verdict,"CONFLICT");
assert.ok(hedged.score>=75 && hedged.score<unhedged.score);
assert.ok(hedged.languageDetails.claim2.applied.some(x=>x.phrase==="I think"&&x.scope==="ASSERTION"&&x.effect<0));
const memory=run(pair("memory-departure"));
assert.ok(memory.commitment.claim2<unhedged.commitment.claim2);
assert.equal(memory.commitment.claim1,unhedged.commitment.claim1);
const knowledge=run(pair("exact-knowledge"));
assert.equal(fired(knowledge,"knowledge").verdict,"CONFLICT");
assert.equal(knowledge.commitment.claim2,SCORING_CONFIG.commitmentBaseline);
assert.ok(knowledge.languageDetails.claim2.ignored.some(x=>x.phrase==="I don't think"));
const afternoon=parseTimeRange("all afternoon");
assert.ok(afternoon.latest>afternoon.earliest);
assert.equal(fired(run(pair("afternoon")),"state").verdict,"CONFLICT");
const recall=analyzeCommitment(new TestimonyFact(claim("I can't recall leaving.")),["leaving"]);
assert.ok(recall.commitment<SCORING_CONFIG.commitmentBaseline);
assert.ok(!recall.applied.some(x=>x.effect>0));
const month=analyzeCommitment(new TestimonyFact(claim("I signed in May.",{activityPhrase:"signed"})),["signed"]);
assert.equal(month.commitment,SCORING_CONFIG.commitmentBaseline);
assert.ok(month.ignored.some(x=>x.phrase==="May"));
const timeline=run(pair("timeline-desk")),explicit=run(pair("signed-polarity"));
assert.equal(fired(timeline,"timeline").basis,"DERIVED");
assert.ok(timeline.score>=explicit.score);
for(const id of ["no-facts","unsupported-states","ambiguous-clock","sample-knowledge"]){
    const r=run(pair(id));assert.equal(r.score,null);assert.equal(r.status,"NOT_EVALUABLE");assert.ok(r.notEvaluableReason);
}
const scopedOutsideField = pair("sample-sleep");
const shortMidnight = {...scopedOutsideField.claim2,timePhrase:"Midnight"};
const widened = scoreFacts(new TestimonyFact(scopedOutsideField.claim1),new TestimonyFact(shortMidnight),scopedOutsideField.context);
assert.equal(fired(widened,"time").ranges[1].widenedBy,SCORING_CONFIG.timeToleranceMinutes);
assert.equal(widened.commitment.pair,SCORING_CONFIG.commitmentBaseline);
const noAnchor=scoreFacts(new TestimonyFact(claim("8 PM",{timePhrase:"8 PM"})),new TestimonyFact(claim("9 PM",{timePhrase:"9 PM"})));
assert.equal(noAnchor.notEvaluableReason,"MISSING_CONTEXT");
const around=run(pair("time-overlap"));
assert.equal(around.commitment.pair,SCORING_CONFIG.commitmentBaseline);
assert.ok(fired(around,"time").ranges[0].widenedBy>0);
assert.equal(around.status,"COMPATIBLE_SUPPORTED");
assert.ok(around.score<=15);
assert.equal(fired(run(pair("quantity-separated")),"quantity").verdict,"CONFLICT");
assert.equal(fired(run(pair("quantity-overlap")),"quantity").verdict,"COMPATIBLE");
assert.equal(run(pair("negation-compatible")).status,"COMPATIBLE_SUPPORTED");
assert.equal(parseTimeRange("20 minutes"),null);
assert.equal(parseTimeRange("November 3rd"),null);
assert.equal(parseTimeRange("around 7").missing,"AM_PM");
const bad=assessCandidate({type:"DIRECT",claim1:claim("Invented"),claim2:home.claim2},home.claim1.original,home.claim2.original);
assert.equal(bad.score,null);assert.equal(bad.notEvaluableReason,"UNVERIFIED_SOURCE");
// Scoring implementation may not read any model-opinion fields.
for(const file of ["engine.js","rules.js","language.js","parsers.js"]){
    const source=readFileSync(new URL(file,import.meta.url),"utf8");
    assert.ok(!/\.(?:type|severity|reasoning|semanticAssist|confidence)\b/.test(source),file);
}
console.log("All deterministic scoring contract tests passed.");

const sequentialStates=scoreFacts(new TestimonyFact(claim("I was awake at 6 PM",{statePhrase:"awake",timePhrase:"6 PM"})),new TestimonyFact(claim("I was asleep at 10 PM",{statePhrase:"asleep",timePhrase:"10 PM"})),{sameEvent:true});
assert.equal(sequentialStates.status,"COMPATIBLE_SUPPORTED");
assert.ok(!sequentialStates.rulesFired.some(r=>r.verdict==="CONFLICT"));
