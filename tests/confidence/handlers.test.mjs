import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers,prepareConfidence} from '../../server/confidence/handlers.js';

const claim = original => ({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,
  objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
function body() {return {caseId:'synthetic-case',finding:{type:'DIRECT',claim1:claim('Exactly three.'),claim2:claim('Exactly five.')},
  texts:['Q: How many invoices that day?\nA: Exactly three.','Q: How many invoices that day?\nA: Exactly five.']};}
function response(){const res=new EventEmitter();res.statusCode=200;res.status=n=>{res.statusCode=n;return res;};res.json=v=>{res.body=v;res.writableEnded=true;return res;};return res;}
const req = (body,id='owner') => ({body,identity:{id}});
const model = () => ({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]});
async function invoke(handler,body,id){const res=response();await handler(req(body,id),res);return res;}

test('free preview validates sources and returns seven checks without calling a model', async()=>{
  let calls=0;const h=createConfidenceHandlers({callModel:async()=>{calls++;return model();}});
  const p=await invoke(h.plan,body());assert.equal(p.statusCode,200);assert.equal(p.body.requests,7);assert.ok(p.body.budgetUsd>0);assert.equal(calls,0);
  assert.equal(JSON.stringify(p.body).includes('Exactly'),false);
  for(const mutate of [b=>{b.texts[0]='Q: Exactly three.\nA: Something else.';},b=>{b.texts[0]='Exactly three.';},
    b=>{b.finding.claim1.original='three invoices';},b=>{b.finding.labelDisagreement=true;}]){
    const b=body();mutate(b);const r=await invoke(h.plan,b);assert.equal(r.statusCode,400);
  }
  assert.equal(calls,0);
});
test('source context preserves full governing answer and does not include original label in requests',()=>{
  const b=body();b.texts[0]='Q: How many invoices that day?\nA: Exactly three. I checked twice.';
  const p=prepareConfidence(b);const request=p.requestFor(0);
  const data=JSON.parse(request.messages[0].content);assert.equal(data.statements[0].answer,'Exactly three. I checked twice.');
  assert.equal(data.type,undefined);assert.equal(data.originalType,undefined);assert.equal(data.votes,undefined);
  assert.notEqual(p.requestFor(0).messages[0].content,p.requestFor(1).messages[0].content);
});
test('approval, ordered steps, ownership and duplicate replay preserve seven-call limit',async()=>{
  let calls=0;const original=body();const before=structuredClone(original);
  const h=createConfidenceHandlers({callModel:async()=>{calls++;return model();}});
  const p=(await invoke(h.plan,original)).body;
  const base={caseId:p.caseId,jobId:p.jobId};
  assert.equal((await invoke(h.step,{...base,step:0})).statusCode,428);
  const approved={...base,approvedBudgetUsd:p.budgetUsd};
  assert.equal((await invoke(h.step,{...approved,step:1})).statusCode,409);
  assert.equal((await invoke(h.step,{...approved,step:0},'other')).statusCode,409);
  assert.equal(calls,0);
  let last;
  for(let step=0;step<7;step++) {last=await invoke(h.step,{...approved,step});assert.equal(last.statusCode,200);}
  assert.equal(last.body.done,true);assert.equal(last.body.hybridConfidence.status,'UNCALIBRATED');
  assert.equal(last.body.hybridConfidence.score,null);assert.equal(last.body.hybridConfidence.agreeingVotes,6);
  assert.equal(last.body.hybridConfidence.originalType,'DIRECT');assert.equal(calls,7);
  await invoke(h.step,{...approved,step:0});assert.equal(calls,7);assert.deepEqual(original,before);
});
test('malformed or truncated responses stop the chain and cannot be retried under the same plan',async()=>{
  for(const value of [{...model(),stop_reason:'max_tokens'}, {...model(),content:[{type:'text',text:'{"type":"DIRECT","objections":[],"score":99}'}]}]){
    let calls=0;const h=createConfidenceHandlers({callModel:async()=>{calls++;return value;}});
    const p=(await invoke(h.plan,body())).body;const b={caseId:p.caseId,jobId:p.jobId,approvedBudgetUsd:p.budgetUsd};
    const first=await invoke(h.step,{...b,step:0});assert.equal(first.body.stopped,true);assert.equal(first.body.hybridConfidence.score,null);
    assert.equal((await invoke(h.step,{...b,step:1})).statusCode,409);
    await invoke(h.step,{...b,step:0});assert.equal(calls,1);
  }
});
test('concurrent duplicate step cannot launch a second paid request',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});
  const h=createConfidenceHandlers({callModel:async()=>{calls++;await pending;return model();}});
  const p=(await invoke(h.plan,body())).body,b={caseId:p.caseId,jobId:p.jobId,approvedBudgetUsd:p.budgetUsd,step:0};
  const first=invoke(h.step,b);await new Promise(resolve=>setTimeout(resolve,5));
  const second=await invoke(h.step,b);assert.equal(second.statusCode,409);release();await first;assert.equal(calls,1);
});
test('expired or over-budget plans make no paid calls',async()=>{
  let time=0,calls=0;const h=createConfidenceHandlers({now:()=>time,callModel:async()=>{calls++;return model();}});
  const p=(await invoke(h.plan,body())).body;time=31*60*1000;
  assert.equal((await invoke(h.step,{caseId:p.caseId,jobId:p.jobId,approvedBudgetUsd:p.budgetUsd,step:0})).statusCode,409);
  const limited=createConfidenceHandlers({maxBudgetUsd:0.0001,callModel:async()=>{calls++;}});
  assert.equal((await invoke(limited.plan,body())).body.code,'BUDGET_LIMIT');assert.equal(calls,0);
});
test('disconnect aborts in-flight work and saves a stopped step',async()=>{
  const h=createConfidenceHandlers({callModel:async(_params,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('stopped')),{once:true}))});
  const p=(await invoke(h.plan,body())).body,res=response();
  const run=h.step(req({caseId:p.caseId,jobId:p.jobId,step:0,approvedBudgetUsd:p.budgetUsd}),res);
  await new Promise(resolve=>setTimeout(resolve,5));res.emit('close');await run;
  assert.equal(res.body.stopped,true);assert.equal(res.body.hybridConfidence.status,'INCOMPLETE');
});
test('hosted store authorization and immutable locks are used across handler instances',async()=>{
  const values=new Map();let auth=0,calls=0;
  const store={authorize:async()=>{auth++;},get:async(c,j,n)=>values.get(`${c}/${j}/${n}`),put:async(c,j,n,v)=>{const k=`${c}/${j}/${n}`;if(values.has(k))return false;values.set(k,v);return true;}};
  const options={storeForRequest:()=>store,callModel:async()=>{calls++;return model();}};
  const p=(await invoke(createConfidenceHandlers(options).plan,body())).body;
  const b={caseId:p.caseId,jobId:p.jobId,step:0,approvedBudgetUsd:p.budgetUsd};
  await invoke(createConfidenceHandlers(options).step,b);await invoke(createConfidenceHandlers(options).step,b);
  assert.equal(calls,1);assert.equal(auth,3);
});
