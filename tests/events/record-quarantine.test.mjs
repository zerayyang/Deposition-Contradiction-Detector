import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {executeEventExtraction} from '../../server/events/extract.js';
import {readingCanContinue} from '../../shared/readingState.js';

// Synthetic expected-results guide: bad literal citations stay quarantined;
// retained notes do not prove a complete comparison or calibrate numeric scores.
// Pending work with gaps is RUNNING; finished all-invalid work is FAILED.
// A forged COMPLETE cache must reject locally, before any transport call.
// Run: node --test tests/events/record-quarantine.test.mjs
const body={workflow:'events-v1',phase:'extract',sameWitnessConfirmed:true,speakerRoles:[{},{}],
 transcript1:'Q: What did you sign?\nA: I signed a fictional form.\nQ: Where did you go?\nA: I visited a fictional office.',
 transcript2:'Q: What did you file?\nA: I filed a fictional notice.'};
const message=response=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:50}});
function responseFor(input){
 const units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);
 return {schemaVersion:1,events:units.map((u,i)=>({id:'e'+i,kind:'synthetic',summary:'Synthetic mock record.',
  assertion:{polarity:'AFFIRMED',sourceIds:['w']},attributes:[],qualifiers:[],relations:[],
  sources:[{id:'w',unitId:u.id,quote:u.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),
  units:units.map((u,i)=>({unitId:u.id,status:'EVENTS',eventIds:['e'+i],reason:null}))};
}
function invalidQuote(record){record.sources[0].quote='Invented citation absent from the synthetic input.';}

test('mixed records quarantine the invalid note, keep a non-terminal snapshot and read the later chunk',async()=>{
 const prepared=await prepareEventWorkflow(body);assert.equal(prepared.plan.requestCount,2);
 let calls=0;const checkpoints=[];
 const result=await executeEventWorkflow({prepared,body,onEvent:event=>{if(event.event==='checkpoint')checkpoints.push(event.analysis);},
  callModel:async params=>{const response=responseFor(JSON.parse(params.messages[0].content));if(calls++===0)invalidQuote(response.events[0]);return message(response);}});
 assert.equal(calls,2);assert.equal(checkpoints.length,2);
 const mid=checkpoints[0],raw=mid.eventState.extraction;
 assert.equal(mid.status,'running');assert.equal(raw.status,'RUNNING');assert.equal(raw.readingFinished,false);
 assert.equal(readingCanContinue(mid),true);
 assert.deepEqual(raw.tasks.map(t=>t.status),['PARTIAL','PENDING']);
 assert.equal(raw.tasks[0].events.length,1);assert.equal(raw.tasks[0].rejected.length,1);
 assert.ok(raw.tasks[0].issues.length>0);assert.equal(raw.documents[0].recordValidation.valid,true);
 assert.equal(result.analysis.status,'awaiting_gap_acknowledgement');
 assert.equal(result.analysis.eventState.extraction.status,'READING_GAPS');
 assert.equal(result.analysis.readingFinished,true);assert.equal(result.analysis.tasks[1].acceptedFindings,1);
});

test('a bounded quarantined reading step remains running and resumes later work without retrying it',async()=>{
 const prepared=await prepareEventWorkflow(body);let calls=0;
 const first=await executeEventWorkflow({prepared,body,maxNewRequests:1,callModel:async params=>{
  calls++;const response=responseFor(JSON.parse(params.messages[0].content));response.events.forEach(invalidQuote);return message(response);
 }});
 assert.equal(calls,1);assert.equal(first.analysis.status,'running');
 assert.equal(first.analysis.eventState.extraction.status,'RUNNING');assert.equal(first.analysis.readingFinished,false);
 assert.equal(first.analysis.tasks[0].acceptedFindings,0);assert.equal(first.analysis.tasks[1].status,'not_attempted');
 assert.equal(readingCanContinue(first.analysis),true);
 const resumedBody={...body,eventState:first.analysis.eventState},next=await prepareEventWorkflow(resumedBody);
 assert.equal(next.preview.retainedGapRequests,1);assert.equal(next.preview.requestCount,1);
 const resumed=await executeEventWorkflow({prepared:next,body:resumedBody,callModel:async params=>{
  calls++;return message(responseFor(JSON.parse(params.messages[0].content)));
 }});
 assert.equal(calls,2);assert.equal(resumed.analysis.tasks[0].reused,true);
 assert.equal(resumed.analysis.tasks[0].acceptedFindings,0);assert.equal(resumed.analysis.tasks[1].acceptedFindings,1);
 assert.equal(resumed.analysis.status,'awaiting_gap_acknowledgement');
});

test('all-invalid final reading remains FAILED after every later chunk is attempted',async()=>{
 const prepared=await prepareEventWorkflow(body);let calls=0;const statuses=[];
 const result=await executeEventWorkflow({prepared,body,onEvent:event=>{if(event.event==='checkpoint')statuses.push(event.analysis.status);},callModel:async params=>{
  calls++;const response=responseFor(JSON.parse(params.messages[0].content));response.events.forEach(invalidQuote);return message(response);
 }});
 assert.equal(calls,2);assert.deepEqual(statuses,['running','running']);
 assert.equal(result.analysis.status,'failed');assert.equal(result.analysis.eventState.extraction.status,'FAILED');
 assert.equal(result.analysis.readingFinished,true);assert.equal(readingCanContinue(result.analysis),false);
 assert.ok(result.analysis.tasks.every(t=>t.acceptedFindings===0));
 assert.ok(result.analysis.eventState.extraction.documents.every(d=>d.events.length===0));
});

test('tampered COMPLETE cached response rejects before acknowledgement, planning or transport',async()=>{
 const prepared=await prepareEventWorkflow(body);
 const result=await executeEventWorkflow({prepared,body,callModel:async params=>message(responseFor(JSON.parse(params.messages[0].content)))});
 const state=structuredClone(result.analysis.eventState),task=state.extraction.tasks[0];
 assert.equal(task.status,'COMPLETE');const response=JSON.parse(task.rawText);invalidQuote(response.events[0]);task.rawText=JSON.stringify(response);
 let calls=0;
 for(const phase of ['extract','compare'])await assert.rejects(async()=>{
  const request={...body,phase,eventState:state,acknowledgeExtractionGaps:true,extractionGapDigest:'forged'};
  const next=await prepareEventWorkflow(request);
  await executeEventWorkflow({prepared:next,body:request,callModel:async()=>{calls++;throw new Error('Transport forbidden.');}});
 },/Saved completed extraction failed fresh validation/);
 assert.equal(calls,0);
});

// A failed checkpoint consumer ends execution; unread tasks must not imply RUNNING.
test('checkpoint callback failure after quarantine attaches a stopped result and makes no later calls',async()=>{
 for(const allInvalid of [false,true]){
  const {plan}=await prepareEventWorkflow(body);let calls=0;
  const failure=new Error('Synthetic checkpoint consumer failure.');
  await assert.rejects(()=>executeEventExtraction({plan,
   approval:{planId:plan.id,requestCount:plan.requestCount,maxUsd:plan.cost.conservativeBudget},
   callModel:async params=>{
    calls++;const response=responseFor(JSON.parse(params.messages[0].content));
    if(allInvalid)response.events.forEach(invalidQuote);else invalidQuote(response.events[0]);
    return message(response);
   },onEvent:event=>{if(event.event==='checkpoint')throw failure;}
  }),error=>{
   assert.equal(error,failure);const stopped=error.extractionResult;
   assert.equal(stopped.status,allInvalid?'FAILED':'PARTIAL');
   assert.equal(stopped.readingFinished,false);
   assert.deepEqual(stopped.tasks.map(t=>t.status),['PARTIAL','PENDING']);
   assert.equal(stopped.tasks[0].events.length,allInvalid?0:1);
   assert.equal(stopped.tasks[0].rejected.length,allInvalid?2:1);
   return true;
  });
  assert.equal(calls,1);
 }
});
