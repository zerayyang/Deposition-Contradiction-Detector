import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAdmission} from '../../server/runtimeControls.js';
import {createConfidenceHandlers,prepareConfidence} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';

// Synthetic fixtures only. Expected behavior: docs/confidence-speed.md.
const names=['alpha','beta','gamma'];
const texts=[false,true].map(deny=>names.map(name=>`Q: Did you sign sample ${name}?\nA: I ${deny?'did not sign':'signed'} sample ${name}.`).join('\n'));
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding=name=>({type:'DIRECT',claim1:claim(`I signed sample ${name}.`),claim2:claim(`I did not sign sample ${name}.`)});
function setup({holdSlow=false,bad=false}={}) {
  let active=0,peak=0,slowDone=false,refilledBeforeSlow=false,gammaSeen=false,releaseSlow;
  const waitForSlow=new Promise(resolve=>{releaseSlow=resolve;});
  const escape=setTimeout(releaseSlow,1000);
  const requests=[];const admission=createAdmission({maxConcurrent:2});
  const handlers=createConfidenceHandlers({callModel:async request=>{
    active++;peak=Math.max(peak,active);requests.push(request);
    const quote=JSON.parse(request.messages[0].content).statements[0].quote;
    try {
      if(holdSlow&&quote.includes('beta'))await waitForSlow;
      if(quote.includes('gamma')&&!gammaSeen){gammaSeen=true;refilledBeforeSlow=!slowDone;releaseSlow();}
      await new Promise(resolve=>setTimeout(resolve,1));
      if(quote.includes('beta'))slowDone=true;
      return {stop_reason:bad?'max_tokens':'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]};
    }finally{active--;}
  }});
  const fetchImpl=async(url,{body})=>{
    const endpoint=url.split('/').at(-1),res=new EventEmitter();
    res.code=200;res.status=code=>{res.code=code;return res;};res.json=value=>{res.value=value;res.writableEnded=true;return res;};
    await admission.run('synthetic-owner',()=>handlers[endpoint]({body:JSON.parse(body),identity:{id:'synthetic-owner'}},res),{ownerLimit:endpoint==='allowance'?1:2});
    return {ok:res.code===200,json:async()=>res.value};
  };
  return {fetchImpl,requests,peak:()=>peak,refilledBeforeSlow:()=>refilledBeforeSlow,cleanup:()=>clearTimeout(escape)};
}
test('rolling pool starts a third finding before the slow peer finishes, with the same calls and cap',async()=>{
  const t=setup({holdSlow:true});
  try {
    const allowance=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:10,requestProfile:'compact-v1'},t);
    const result=await runAutomaticConfidence({findings:names.map(finding),texts,caseId:'synthetic',allowance,...t,concurrency:2});
    assert.equal(result.status,'FINISHED');assert.equal(result.checked,3);assert.equal(t.requests.length,21);
    assert.equal(t.peak(),2);assert.equal(t.refilledBeforeSlow(),true);
  }finally{t.cleanup();}
});
test('compact profile lowers output reservation while preserving full source context and model identities',async()=>{
  const body={finding:finding('alpha'),texts};
  const legacy=prepareConfidence(body),compact=prepareConfidence(body,'','compact-v1');
  assert.ok(compact.budgetUsd<legacy.budgetUsd);
  for(let step=0;step<7;step++) {
    const old=legacy.requestFor(step),fast=compact.requestFor(step);
    assert.equal(old.max_tokens,2048);assert.equal(fast.max_tokens,1536);assert.equal(fast.model,old.model);
    assert.deepEqual(JSON.parse(fast.messages[0].content),JSON.parse(old.messages[0].content));
    assert.match(fast.system,/at most three concerns/);assert.match(fast.system,/180 characters/);
  }
  const t=setup();
  try {
    const allowance=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:10,requestProfile:'compact-v1'},t);
    assert.equal(allowance.requestProfile,'compact-v1');
    const result=await runAutomaticConfidence({findings:[finding('alpha')],texts,caseId:'synthetic',allowance,...t,concurrency:2});
    assert.equal(result.checked,1);assert.ok(t.requests.every(request=>request.max_tokens===1536));
    const saved=result.results[0].hybridConfidence;
    const replay=await t.fetchImpl('/api/confidence/step',{body:JSON.stringify({caseId:'synthetic',jobId:saved.jobId,step:0,approvedBudgetUsd:compact.budgetUsd,requestProfile:'legacy'})});
    assert.equal(replay.ok,true);assert.equal(t.requests.length,7);
  }finally{t.cleanup();}
});
test('compact output truncation remains an explicit failure with no automatic paid retry',async()=>{
  const t=setup({bad:true});
  try {
    const allowance=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:10,requestProfile:'compact-v1'},t);
    const result=await runAutomaticConfidence({findings:[finding('alpha')],texts,caseId:'synthetic',allowance,...t,concurrency:2});
    assert.equal(result.status,'INCOMPLETE');assert.equal(t.requests.length,1);assert.equal(result.results[0].hybridConfidence.score,null);
  }finally{t.cleanup();}
});
