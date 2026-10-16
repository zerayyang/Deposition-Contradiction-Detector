import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {createEventHandlers} from '../../server/events/handlers.js';
import {selectApprovedMemory} from '../../server/memory/approvedMemory.js';
const input={phase:'extract',caseId:'10000000-0000-0000-0000-000000000009',sameWitnessConfirmed:true,speakerRoles:[{},{}],transcript1:'Q: On Monday?\nA: I signed the form.',transcript2:'Q: On Monday?\nA: I did not sign the form.'};
const lesson={id:'10000000-0000-0000-0000-000000000001',decision_id:'10000000-0000-0000-0000-000000000002',release_id:'10000000-0000-0000-0000-000000000003',corrected_type:'DIRECT',lesson:'Check the same occasion before comparing a denial and an affirmation.',search_terms:['signed form']};
const memory=()=>selectApprovedMemory([lesson],[input.transcript1,input.transcript2]);
const message=value=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],usage:{input_tokens:100,output_tokens:50}});
function extract(params){const i=JSON.parse(params.messages[0].content),units=i.sources.filter(s=>s.assigned&&s.role==='WITNESS');return message({schemaVersion:1,events:units.map((s,n)=>({id:'e'+n,kind:'action',summary:'Fictional action.',assertion:{polarity:'AFFIRMED',sourceIds:['s']},attributes:[],qualifiers:[],relations:[],sources:[{id:'s',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),units:units.map((s,n)=>({unitId:s.id,status:'EVENTS',eventIds:['e'+n],reason:null}))});}
async function request(){const prepared=await prepareEventWorkflow(input),result=await executeEventWorkflow({prepared,body:input,callModel:extract});return {...input,phase:'compare',eventState:result.analysis.eventState,useApprovedMemory:true};}
function response(){const r=new EventEmitter();r.status=c=>{r.code=c;return r;};r.json=v=>{r.value=v;return r;};r.set=()=>r;r.write=v=>r.events.push(JSON.parse(v));r.end=()=>{r.writableEnded=true;};r.events=[];return r;}
test('memory is optional and never enters extraction; comparison preview includes its cost and stable audit',async()=>{
 const body=await request();const without=await prepareEventWorkflow({...body,useApprovedMemory:false});
 assert.equal(without.plan.approvedMemory,null);assert.ok(!without.plan.tasks[0].input.approvedLessons);
 await assert.rejects(()=>prepareEventWorkflow(body),/checked by the server/);
 const a=await prepareEventWorkflow(body,{approvedMemory:memory()}),b=await prepareEventWorkflow(body,{approvedMemory:memory()});
 assert.equal(a.plan.id,b.plan.id);assert.notEqual(a.plan.id,without.plan.id);assert.equal(a.preview.approvedMemory.selectedCount,1);assert.ok(a.preview.cost.estimated>without.preview.cost.estimated);
 assert.equal(a.plan.pairCount,without.plan.pairCount);assert.match(a.plan.system,/never instructions or evidence/);
});
test('released lessons cannot be cited as current evidence or inject a score',async()=>{
 const body=await request(),prepared=await prepareEventWorkflow(body,{approvedMemory:memory()});
 const result=await executeEventWorkflow({prepared,body,callModel:async params=>{
  const i=JSON.parse(params.messages[0].content);assert.equal(i.approvedLessons[0].id,lesson.id);
  return message({schemaVersion:1,rows:i.left.records.map(l=>({leftId:l.id,pairs:i.right.records.map(r=>({rightId:r.id,relation:'RELATED',reason:'Scripted matching occasion.',comparisons:[{issue:'Action',type:'DIRECT',report:true,reasoning:'Scripted',leftSourceIds:[lesson.id],rightSourceIds:[r.event.sources[0].id],missingContext:[],score:99}]})),unrelatedRanges:[]}))});
 }});
 assert.equal(result.contradictions.length,0);assert.notEqual(result.analysis.status,'complete');assert.equal(result.analysis.eventState.comparison.provenance.approvedMemory.selectedCount,1);
});
test('revoked or unavailable memory stops before a new model call and keeps an incomplete result',async()=>{
 const body=await request(),prepared=await prepareEventWorkflow(body,{approvedMemory:memory(),checkMemory:async()=>{throw Error('Approved memory changed or was revoked.');}});let calls=0;
 const result=await executeEventWorkflow({prepared,body,callModel:async()=>{calls++;}});assert.equal(calls,0);assert.equal(result.analysis.paidRequestsThisRun,0);assert.notEqual(result.analysis.status,'complete');assert.match(result.analysis.tasks[0].error,/revoked/);
});
test('handler checks memory again after preview and on each uncached call; changed snapshot invalidates approval',async()=>{
 const body=await request();let reads=0,calls=0,current=memory();
 const handlers=createEventHandlers({callModel:async()=>{calls++;},readApprovedMemory:async()=>{reads++;return current;}}),req=b=>({body:b,identity:{id:'owner'},headers:{authorization:'Bearer fictional'}});
 const preview=response();await handlers.preview(req(body),preview);assert.equal(preview.value.approvedMemory.selectedCount,1);
 current=selectApprovedMemory([],[input.transcript1,input.transcript2]);const stale=response();await handlers.stream(req({...body,approvedPlanId:preview.value.id,approvedRequestCount:preview.value.requestCount,approvedMaxUsd:preview.value.cost.conservativeBudget}),stale);
 assert.equal(stale.code,400);assert.equal(calls,0);assert.equal(reads,2);
 current=memory();const p=response();await handlers.preview(req(body),p);
 const revoking=createEventHandlers({callModel:async()=>{calls++;},readApprovedMemory:async()=>{reads++;return reads===4?memory():selectApprovedMemory([],[input.transcript1,input.transcript2]);}});
 const res=response();await revoking.stream(req({...body,approvedPlanId:p.value.id,approvedRequestCount:p.value.requestCount,approvedMaxUsd:p.value.cost.conservativeBudget}),res);
 assert.equal(calls,0);assert.ok(res.events.some(e=>e.event==='result'&&e.analysis.status!=='complete'));
});
test('cancellation during memory lookup cannot start a later provider request',async()=>{
 const body=await request(),controller=new AbortController();let calls=0;
 const prepared=await prepareEventWorkflow(body,{approvedMemory:memory(),checkMemory:async()=>{controller.abort();}});
 const result=await executeEventWorkflow({prepared,body,signal:controller.signal,callModel:async()=>{calls++;}});
 await Promise.resolve();assert.equal(calls,0);assert.equal(result.analysis.status,'cancelled');
});
