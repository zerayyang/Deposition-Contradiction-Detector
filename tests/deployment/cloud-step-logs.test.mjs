import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudAnalysis} from '../../server/cloudAnalysis.js';

// Fictional transport only. Hosted jobs log start, each step and failures with
// identifiers, counts, cost and error codes, never testimony or model text.
const caseId='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const response=()=>({code:200,status(n){this.code=n;return this;},json(value){this.value=value;return this;}});
const body={caseId,transcript1:'Q: First event on Monday?\nA: PRIVATE_TESTIMONY signed.',transcript2:'Q: First event on Monday?\nA: PRIVATE_TESTIMONY left.'};
const msg=()=>({stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:JSON.stringify({topicsReviewed:['PRIVATE_TOPIC'],contradictions:[]})}]});
const req=value=>({identity:{id:'owner'},params:{caseId,jobId},body:value??{}});
function setup(){
  const objects=new Map(),events=[];
  const store={authorize:async()=>{},get:async(c,j,n)=>objects.get(c+'/'+j+'/'+n)??null,put:async(c,j,n,v)=>{const k=c+'/'+j+'/'+n;if(objects.has(k))return false;objects.set(k,structuredClone(v));return true;}};
  const api=createCloudAnalysis({instructions:'Fictional.',codeFingerprint:'fixture',storeForRequest:()=>store,callModel:async()=>msg(),log:e=>events.push(e)});
  return {api,events};
}
async function start(api,maxUsd){const p=response();await api.preview(req(body),p);const r=response();
  await api.start(req({...body,approvedPlanId:p.value.id,approvedRequestCount:p.value.requestCount,approvedMaxUsd:maxUsd??p.value.cost.conservativeBudget,allowPartialBudget:maxUsd!==undefined}),r);assert.equal(r.code,200);}

test('a hosted job logs its start and each finished step with cost, and no content',async()=>{
  const {api,events}=setup();await start(api);const r=response();await api.step(req(),r);assert.equal(r.code,200);
  const started=events.find(e=>e.event==='cloud_job_started'),step=events.find(e=>e.event==='cloud_step_finished');
  assert.equal(started.jobId,jobId);assert.ok(started.requestCount>=1);
  assert.equal(step.jobId,jobId);assert.equal(step.sequence,0);assert.equal(step.paidRequests,1);assert.equal(typeof step.costUsd,'number');assert.equal(typeof step.durationMs,'number');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_TESTIMONY|PRIVATE_TOPIC|transcript/);
});

test('a refused step logs an error code, not the error text',async()=>{
  const {api,events}=setup();await start(api,0.000001);const r=response();await api.step(req(),r);
  const failed=events.find(e=>e.event==='cloud_step_failed'||e.event==='cloud_step_finished');
  assert.ok(failed,'step outcome logged');
  if(failed.event==='cloud_step_failed'){assert.equal(typeof failed.errorCode,'string');assert.equal(failed.message,undefined);}
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_TESTIMONY|approved budget cannot/);
});

test('cancellation is logged',async()=>{
  const {api,events}=setup();await start(api);const r=response();await api.cancel(req(),r);
  assert.ok(events.some(e=>e.event==='cloud_job_cancel_requested'&&e.jobId===jobId));
});
