import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers,prepareConfidence} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';
import {createAdmission} from '../../server/runtimeControls.js';

// Synthetic fixtures only; expected behavior: docs/confidence-concurrency.md.
const texts=['Q: Did you sign the sample?\nA: I signed it.','Q: Did you sign the sample?\nA: I did not sign it.'];
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding=()=>({type:'DIRECT',claim1:claim('I signed it.'),claim2:claim('I did not sign it.')});
function setup({usage={input_tokens:100,output_tokens:20},bad=false}={}) {
  let calls=0,active=0,peak=0;
  const handlers=createConfidenceHandlers({callModel:async()=>{
    calls++;active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
    return {stop_reason:bad?'max_tokens':'end_turn',usage,content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]};
  }});
  const history=[];
  const fetchImpl=async(url,{body})=>{
    const input=JSON.parse(body),res=new EventEmitter();
    res.code=200;res.status=code=>{res.code=code;return res;};res.json=value=>{res.value=value;res.writableEnded=true;return res;};
    await handlers[url.split('/').at(-1)]({body:input,identity:{id:'synthetic-owner'}},res);
    history.push({endpoint:url.split('/').at(-1),jobId:input.jobId,step:input.step,code:res.value.code});
    return {ok:res.code===200,json:async()=>res.value};
  };
  return {fetchImpl,history,calls:()=>calls,peak:()=>peak,active:()=>active};
}
const offer=(t,budgetUsd=3)=>prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd},t);
test('two findings overlap while each keeps seven ordered steps and the same total calls',async()=>{
  const t=setup(),allowance=await offer(t),snapshots=[];
  const result=await runAutomaticConfidence({findings:Array.from({length:4},finding),texts,caseId:'synthetic',allowance,...t,concurrency:2,
    onCheckpoint:async snapshot=>{snapshots.push(snapshot);await Promise.resolve();}});
  assert.equal(result.status,'FINISHED');assert.equal(result.checked,4);assert.equal(t.calls(),28);
  assert.ok(result.results.every(f=>f.hybridConfidence.combination.code.max===10));
  assert.equal(t.peak(),2);assert.equal(t.active(),0);
  const jobs=Map.groupBy(t.history.filter(h=>h.endpoint==='step'),h=>h.jobId);
  for(const steps of jobs.values())assert.deepEqual(steps.map(s=>s.step),[0,1,2,3,4,5,6]);
  const counts=snapshots.map(s=>s.reduce((sum,f)=>sum+(f.hybridConfidence.completedSteps??0),0));
  assert.ok(counts.every((value,i)=>i===0||value>=counts[i-1]));
  assert.equal(counts.at(-1),28);assert.equal(counts[0],1);
});
test('server rejects a third active reservation, duplicate allocation, and mode mixing',async()=>{
  const t=setup(),allowance=await offer(t);
  const allocate=async(index,concurrency=2)=>{
    const response=await t.fetchImpl('/api/confidence/plan',{body:JSON.stringify({caseId:'synthetic',texts,finding:finding(),
      allowance:{jobId:allowance.jobId,index,approvedUsd:allowance.budgetUsd,concurrency}})});
    return {ok:response.ok,value:await response.json()};
  };
  assert.equal((await allocate(0)).ok,true);
  assert.equal((await allocate(0)).value.code,'ALLOCATION_ALREADY_STARTED');
  assert.equal((await allocate(1)).ok,true);
  assert.equal((await allocate(2)).value.code,'CONCURRENCY_LIMIT');
  assert.equal((await allocate(2,1)).value.code,'INVALID_ALLOCATION');assert.equal(t.calls(),0);
});
test('tight funds defer free planning until settlement; unknown usage cannot overspend',async()=>{
  const per=prepareConfidence({finding:finding(),texts}).budgetUsd;
  for(const usage of [{input_tokens:100,output_tokens:20},null]) {
    const t=setup({usage}),allowance=await offer(t,per*1.5);
    const result=await runAutomaticConfidence({findings:[finding(),finding()],texts,caseId:'synthetic',allowance,...t,concurrency:2});
    assert.equal(result.results.length,2);
    assert.equal(result.status,usage?'FINISHED':'BUDGET_LIMIT');assert.equal(t.calls(),usage?14:7);
    assert.ok(result.results.reduce((sum,f)=>sum+(f.hybridConfidence.spentUsd??0),0)<=allowance.budgetUsd);
    assert.equal(t.peak(),1);
  }
});
// Owner decision (Oct 2026): a failed check ends only its own finding; the others are still checked.
// Cancelling still stops new steps. Neither case retries a paid call automatically.
test('a failed check stops only its finding; cancellation stops new steps; partial votes are kept',async()=>{
  for(const cancel of [false,true]) {
    const t=setup({bad:!cancel}),allowance=await offer(t),controller=new AbortController();
    const result=await runAutomaticConfidence({findings:Array.from({length:4},finding),texts,caseId:'synthetic',allowance,...t,concurrency:2,
      signal:controller.signal,onCheckpoint:async()=>{if(cancel)controller.abort();}});
    assert.equal(result.status,cancel?'CANCELLED':'INCOMPLETE');
    assert.equal(t.calls(),cancel?2:4,'each finding fails once, with no retry');assert.equal(t.active(),0);assert.equal(result.results.length,4);
    const tried=cancel?2:4;
    assert.ok(result.results.slice(0,tried).every(f=>f.hybridConfidence.votes.length===1));
    assert.ok(result.results.every(f=>f.hybridConfidence.score===null));
    if(!cancel)assert.equal(result.incomplete,4);
  }
});
test('checkpoint failure stops both workers and completes no further calls',async()=>{
  const t=setup(),allowance=await offer(t);
  await assert.rejects(runAutomaticConfidence({findings:Array.from({length:4},finding),texts,caseId:'synthetic',allowance,...t,concurrency:2,
    onCheckpoint:async()=>{throw Error('Synthetic checkpoint failure');}}),/Synthetic checkpoint failure/);
  assert.equal(t.calls(),2);assert.equal(t.active(),0);
});
test('source rejection uses no slot or paid call, older capabilities fall back to serial',async()=>{
  const t=setup(),allowance=await offer(t),invalid=finding();invalid.claim1.original='Invented synthetic quote.';
  const result=await runAutomaticConfidence({findings:[invalid,finding(),finding()],texts,caseId:'synthetic',allowance:{...allowance,maxConcurrentFindings:undefined},...t,concurrency:2});
  assert.equal(result.checked,2);assert.equal(t.calls(),14);assert.equal(t.peak(),1);
  assert.equal(result.results[0].hybridConfidence.status,'SOURCE_REVIEW_REQUIRED');
});
test('admission permits only the two-request confidence lane and preserves global/analysis limits',async()=>{
  const gate=createAdmission({maxConcurrent:2});let release1,release2;
  const one=gate.run('owner',()=>new Promise(resolve=>{release1=resolve;}),{ownerLimit:2});
  const two=gate.run('owner',()=>new Promise(resolve=>{release2=resolve;}),{ownerLimit:2});
  assert.equal(gate.active,2);
  await assert.rejects(gate.run('owner',async()=>{}, {ownerLimit:2}),e=>e.status===429);
  await assert.rejects(gate.run('owner',async()=>{}),e=>e.status===429);
  await assert.rejects(gate.run('other-owner',async()=>{}),e=>e.status===429);
  release1();release2();await Promise.all([one,two]);assert.equal(gate.active,0);
  let releaseAnalysis;
  const analysis=gate.run('owner',()=>new Promise(resolve=>{releaseAnalysis=resolve;}));
  await assert.rejects(gate.run('owner',async()=>{}, {ownerLimit:2}),e=>e.status===429);
  releaseAnalysis();await analysis;assert.equal(gate.active,0);
});
test('configured single-request server advertises a serial fallback',async()=>{
  const handlers=createConfidenceHandlers({maxConcurrentFindings:1,callModel:async()=>{throw Error('No model calls');}});
  const res={status(){return this;},json(value){this.value=value;return this;}};
  await handlers.allowance({identity:{id:'synthetic-owner'},body:{caseId:'synthetic',texts}},res);
  assert.equal(res.value.maxConcurrentFindings,1);
});
