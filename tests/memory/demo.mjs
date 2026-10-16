// Offline mechanics demonstration. Scripted transport; never evidence of model learning.
import assert from 'node:assert/strict';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {selectApprovedMemory} from '../../server/memory/approvedMemory.js';
const input={phase:'extract',caseId:'10000000-0000-0000-0000-000000000009',sameWitnessConfirmed:true,speakerRoles:[{},{}],transcript1:'Q: Were you at home on Monday evening?\nA: I was at home all evening.',transcript2:'Q: Were you at home on Monday evening?\nA: I left home at 8 pm.'};
const message=value=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],usage:{input_tokens:100,output_tokens:50}});
let extractionCalls=0;
const extraction=await executeEventWorkflow({prepared:await prepareEventWorkflow(input),body:input,callModel:async params=>{
 extractionCalls++;const i=JSON.parse(params.messages[0].content),units=i.sources.filter(s=>s.assigned&&s.role==='WITNESS');
 return message({schemaVersion:1,events:units.map((s,n)=>({id:'e'+n,kind:'presence',summary:'Scripted fictional presence event.',assertion:{polarity:'AFFIRMED',sourceIds:['s']},attributes:[],qualifiers:[],relations:[],sources:[{id:'s',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),units:units.map((s,n)=>({unitId:s.id,status:'EVENTS',eventIds:['e'+n],reason:null}))});
}});
const lesson={id:'10000000-0000-0000-0000-000000000001',decision_id:'10000000-0000-0000-0000-000000000002',release_id:'10000000-0000-0000-0000-000000000003',corrected_type:'DIRECT',lesson:'Check whether both statements describe the same occasion before comparing them.',search_terms:['home evening']};
const memory=selectApprovedMemory([lesson],[input.transcript1,input.transcript2]),rows=[],outputs=[];
for(const enabled of [false,true]){
 const body={...input,phase:'compare',eventState:extraction.analysis.eventState,useApprovedMemory:enabled},prepared=await prepareEventWorkflow(body,{approvedMemory:enabled?memory:null});let calls=0;
 const result=await executeEventWorkflow({prepared,body,callModel:async params=>{
  calls++;const i=JSON.parse(params.messages[0].content);assert.equal(i.approvedLessons?.length??0,enabled?1:0);
  return message({schemaVersion:1,rows:i.left.records.map(left=>({leftId:left.id,pairs:i.right.records.map(right=>({rightId:right.id,relation:'RELATED',reason:'Scripted same occasion.',comparisons:[{issue:'Presence',type:'DIRECT',report:true,reasoning:'Scripted comparison; not measured AI performance.',leftSourceIds:[left.event.sources[0].id],rightSourceIds:[right.event.sources[0].id],missingContext:[]}]})),unrelatedRanges:[]}))});
 }});
 assert.equal(result.analysis.status,'complete');assert.equal(result.contradictions.length,1);assert.equal(calls,1);
 const f=result.contradictions[0];outputs.push(f);
 rows.push({mode:enabled?'With approved lesson':'Without memory',lessons:enabled?memory.audit.selectedCount:0,pairs:prepared.plan.pairCount,mockRequests:calls,status:result.analysis.status,type:f.type,codeScore:f.score,estimatedRequestUsd:prepared.preview.cost.estimated});
}
assert.equal(outputs[0].score,outputs[1].score);assert.equal(extractionCalls,2);
console.log('OFFLINE DEMO — synthetic inputs, scripted model output, zero provider requests.');console.table(rows);
console.log('PASS: same pair coverage, valid source quotes, same code score; memory changes the approved plan and prompt cost.');
console.log('NOT MEASURED: real model accuracy improvement, latency, billing, or cross-run stability.');
