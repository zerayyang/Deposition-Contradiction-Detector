import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudAnalysis} from '../../server/cloudAnalysis.js';
import {runCloudAnalysis,resumableCloudJobId} from '../../src/lib/cloudAnalysisClient.js';
const caseId='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const response=()=>({code:200,status(n){this.code=n;return this;},json(value){this.value=value;return this;}});
const body={caseId,transcript1:'Q: First event on Monday?\nA: I signed.\nQ: Second event on Tuesday?\nA: I left.',transcript2:'Q: First event on Monday?\nA: I signed.\nQ: Second event on Tuesday?\nA: I left.'};
const msg=()=>({stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:JSON.stringify({topicsReviewed:['Fictional transport only'],contradictions:[]})}]});
function setup({model=async()=>msg(),stepTimeoutMs=2000,checkRequest=null}={}){
 const objects=new Map();let calls=0;
 const store={authorize:async id=>{if(id!==caseId)throw Error('Denied');},get:async(c,j,n)=>objects.get(c+'/'+j+'/'+n)??null,put:async(c,j,n,v)=>{const key=c+'/'+j+'/'+n;if(objects.has(key))return false;objects.set(key,structuredClone(v));return true;}};
 const make=(fingerprint='fixture')=>createCloudAnalysis({instructions:'Fictional transport check.',codeFingerprint:fingerprint,storeForRequest:request=>{checkRequest?.(request);return store;},legacyPlanOptions:{singleRequestBytes:1,chunkBytes:45,overlapBytes:0},callModel:async(...args)=>{calls++;return model(...args);},stepTimeoutMs});
 return {objects,make,get calls(){return calls;}};
}
const req=value=>({identity:{id:'owner'},params:{caseId,jobId},body:value??{}});
async function start(api,cap){const preview=response();await api.preview(req(body),preview);assert.equal(preview.code,200);const r=response();await api.start(req({...body,approvedPlanId:preview.value.id,approvedRequestCount:preview.value.requestCount,approvedMaxUsd:cap??preview.value.cost.conservativeBudget,allowPartialBudget:cap!==undefined}),r);assert.equal(r.code,200);return preview.value;}
test('each hosted invocation makes one new model call and a new server instance resumes without repeating completed work',async()=>{
 const s=setup(),api=s.make(),plan=await start(api);assert.ok(plan.requestCount>1);assert.equal(s.calls,0);
 for(let n=0;n<plan.requestCount;n++){const result=response();await s.make().step(req(),result);assert.equal(result.code,200);assert.equal(s.calls,n+1);assert.equal(result.value.result.analysis.completed,n+1);}
 const final=response();await api.status(req(),final);assert.equal(final.value.result.analysis.status,'complete');assert.equal(final.value.done,true);const repeated=response();await api.step(req(),repeated);assert.equal(s.calls,plan.requestCount);
});
test('atomic claims reject simultaneous paid steps and preserve the first provider result',async()=>{
 let release;const s=setup({model:()=>new Promise(resolve=>{release=()=>resolve(msg());})}),api=s.make();await start(api);
 const first=response(),pending=api.step(req(),first);while(!release)await new Promise(resolve=>setTimeout(resolve,1));
 const second=response();await s.make().step(req(),second);assert.equal(second.code,409);assert.equal(s.calls,1);release();await pending;assert.equal(first.code,200);
});
test('changed builds retain readable results but cannot resume paid work; cancellation blocks later calls',async()=>{
 const s=setup(),api=s.make();await start(api);const r=response();await api.step(req(),r);const newer=s.make('changed');const saved=response();await newer.status(req(),saved);assert.equal(saved.code,200);
 const blocked=response();await newer.step(req(),blocked);assert.equal(blocked.code,400);assert.equal(s.calls,1);
 const cancel=response();await newer.cancel(req(),cancel);assert.equal(cancel.code,200);const stopped=response();await api.step(req(),stopped);assert.equal(s.calls,1);
});
test('a budget reservation stops paid work before transport and failure cannot automatically retry',async()=>{
 const s=setup(),api=s.make();await start(api,0.000001);const r=response();await api.step(req(),r);assert.equal(s.calls,0);assert.match(JSON.stringify(r.value),/approved budget/);
 const again=response();await api.step(req(),again);assert.equal(s.calls,0);
});
test('a checkpoint write failure leaves an explicit claimed state and never repeats the model request',async()=>{
 const s=setup(),api=s.make();await start(api);const original=s.objects.set.bind(s.objects);s.objects.set=(key,value)=>{if(key.endsWith('-result'))throw Error('Storage unavailable');return original(key,value);};
 const r=response();await api.step(req(),r);assert.equal(r.code,400);assert.equal(s.calls,1);const status=response();await api.status(req(),status);assert.equal(status.value.waiting,true);const again=response();await api.step(req(),again);assert.equal(again.code,409);assert.equal(s.calls,1);
});
test('hosted timeout yields a retained failed/cancelled result without retries',async()=>{
 const s=setup({model:()=>new Promise(()=>{}),stepTimeoutMs:10}),api=s.make();await start(api);const r=response();await api.step(req(),r);assert.equal(r.code,200);assert.equal(s.calls,1);assert.equal(r.value.done,true);const next=response();await api.step(req(),next);assert.equal(s.calls,1);
});
test('cloud client emits durable IDs, starts no extra model work through GET and stops on saved completion',async()=>{
 let calls=0;const completed={topicsReviewed:[],contradictions:[],analysis:{status:'complete',completed:1,attempted:1,tasks:[]}};
 const fetchImpl=async(url,options={})=>{if(url.endsWith('/step')){calls++;return new Response(JSON.stringify({done:true,waiting:false,result:completed}));}return new Response(JSON.stringify({done:false,waiting:false,result:null}));};
 const events=[];await runCloudAnalysis({...body},{id:'fixture',execution:'durable-steps',requestCount:1,cost:{conservativeBudget:1}},{fetchImpl,newId:()=>jobId,onEvent:e=>events.push(e),sleep:async()=>{}});assert.equal(calls,1);assert.ok(events.some(e=>e.analysis?.cloudJobId===jobId));assert.equal(events.at(-1).analysis.status,'complete');
});

test('retained source warnings never repeat a completed paid comparison or erase its coverage',async()=>{
 const s=setup(),api=s.make();const plan=await start(api);const first=response();await api.step(req(),first);
 const key=[...s.objects.keys()].find(k=>k.endsWith('/s0-result'));const record=s.objects.get(key);
 record.result.analysis.issues=[{pairId:'0:0',candidateIndex:0,reason:'Source context unresolved; retained for review.'}];
 const second=response();await api.step(req(),second);assert.equal(second.code,200);assert.equal(s.calls,2);assert.equal(second.value.result.analysis.completed,2);
 assert.equal(second.value.result.analysis.tasks[0].status,'completed');assert.equal(second.value.result.analysis.tasks[1].status,'completed');assert.equal(second.value.result.analysis.tasks[0].previousAttempts,undefined);
 assert.equal(second.value.result.analysis.issues.length,1);assert.ok(plan.requestCount>1);
});

test('the analysis button can request a fresh approval after a definite failure while unknown in-flight work stays recoverable',()=>{
 assert.equal(resumableCloudJobId({cloudJobId:jobId,status:'failed',tasks:[{status:'failed'}]}),null);
 assert.equal(resumableCloudJobId({cloudJobId:jobId,status:'complete'}),null);
 assert.equal(resumableCloudJobId({cloudJobId:jobId,status:'partial',tasks:[{status:'partial'}]}),null);
 assert.equal(resumableCloudJobId({cloudJobId:jobId,status:'interrupted',tasks:[]}),jobId);
 assert.equal(resumableCloudJobId({cloudJobId:jobId,status:'partial',tasks:[{status:'completed'},{status:'not_attempted'}]}),jobId);
});


test('resume cost preview preserves Express prototype headers and original authenticated request',async()=>{
 let expected=null;
 const s=setup({checkRequest:request=>{if(expected){assert.equal(request,expected);assert.equal(request.headers.authorization,'Bearer fictional-test');assert.equal(request.identity.id,'owner');}}});
 const api=s.make();await start(api);const step=response();await api.step(req(),step);
 expected=Object.assign(Object.create({get headers(){return {authorization:'Bearer fictional-test'};}}),req({...body,cloudJobId:jobId}));
 const originalParams=expected.params;
 assert.equal(Object.hasOwn(expected,'headers'),false);
 const preview=response();await api.preview(expected,preview);
 assert.equal(preview.code,200,JSON.stringify(preview.value));
 assert.equal(preview.value.resuming,true);assert.equal(s.calls,1);
 assert.equal(expected.params,originalParams);
});
