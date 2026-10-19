import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';
import {confidenceApprovalReady} from '../../src/lib/confidenceApproval.js';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Synthetic fixtures and expected behavior: docs/confidence-capped-preview.md.
const texts=[0,1].map(d=>Array.from({length:20},(_,i)=>`Q: Synthetic question ${i}?\nA: Synthetic answer ${d}-${i}.`).join('\n'));
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding=()=>({type:'DIRECT',claim1:claim('Synthetic answer 0-0.'),claim2:claim('Synthetic answer 1-0.')});
function setup(maxBudgetUsd=1) {
  let calls=0;const responses=[];
  const handlers=createConfidenceHandlers({maxBudgetUsd,callModel:async()=>{calls++;return {
    stop_reason:'end_turn',usage:null,content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}],
  };}});
  const fetchImpl=async(url,{body})=>{
    const res=Object.assign(new EventEmitter(),{code:200,status(code){this.code=code;return this;},json(value){this.value=value;this.writableEnded=true;return this;}});
    await handlers[url.split('/').at(-1)]({body:JSON.parse(body),identity:{id:'synthetic-owner'}},res);
    responses.push({endpoint:url.split('/').at(-1),status:res.code,code:res.value.code,stopped:res.value.stopped});
    return {ok:res.code===200,json:async()=>res.value};
  };
  return {fetchImpl,calls:()=>calls,responses};
}
test('over-ceiling forecast returns a free capped offer with the full estimate and ceiling intact',async()=>{
  const t=setup(),offer=await prepareConfidenceAllowance({caseId:'synthetic',texts},t);
  assert.equal(t.calls(),0);assert.equal(offer.budgetUsd,1);assert.equal(offer.serverBudgetLimitUsd,1);
  assert.ok(offer.requiredBudgetUsd>1);assert.equal(offer.requiresPartialApproval,true);
  assert.equal(offer.canFitEstimatedFinding,true);assert.equal(confidenceApprovalReady(offer),false);
  assert.equal(confidenceApprovalReady({...offer,partialApproved:true}),true);
  await assert.rejects(prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:2},t),e=>e.code==='BUDGET_LIMIT');
  assert.equal(t.calls(),0);
});
test('server refuses unacknowledged partial coverage before allocating a finding or spending',async()=>{
  const t=setup(),offer=await prepareConfidenceAllowance({caseId:'synthetic',texts},t);
  const body={caseId:'synthetic',texts,finding:finding(),allowance:{jobId:offer.jobId,index:0,approvedUsd:1}};
  let response=await t.fetchImpl('/api/confidence/plan',{body:JSON.stringify(body)});
  assert.equal(response.ok,false);assert.equal((await response.json()).code,'PARTIAL_CONFIDENCE_APPROVAL_REQUIRED');
  body.allowance.partialApproved=true;
  response=await t.fetchImpl('/api/confidence/plan',{body:JSON.stringify(body)});
  assert.equal(response.ok,true);assert.equal(t.calls(),0);
});
test('client cannot start without acknowledgement; an approved cap retains scores and stops without retry',async()=>{
  const t=setup(),offer=await prepareConfidenceAllowance({caseId:'synthetic',texts},t);
  const findings=Array.from({length:8},finding);
  await assert.rejects(runAutomaticConfidence({findings,texts,caseId:'synthetic',allowance:offer,fetchImpl:async()=>{throw Error('Should not fetch');}}),/Approve limited/);
  const result=await runAutomaticConfidence({findings,texts,caseId:'synthetic',allowance:{...offer,partialApproved:true},...t});
  assert.equal(result.status,'BUDGET_LIMIT',JSON.stringify({responses:t.responses,calls:t.calls()}));assert.equal(result.results.length,8);
  assert.ok(result.checked>0&&result.checked<8);assert.equal(t.calls(),result.checked*7);
  assert.ok(result.results.filter(f=>f.hybridConfidence.status==='BUDGET_LIMIT').every(f=>f.hybridConfidence.score===null));
  assert.ok(result.results.every(f=>f.type==='DIRECT'));
  assert.ok(result.results.reduce((sum,f)=>sum+(f.hybridConfidence.spentUsd??0),0)<=1);
});
test('uncapped offers need no extra acknowledgement, insufficient offers cannot start',async()=>{
  const t=setup(25),offer=await prepareConfidenceAllowance({caseId:'synthetic',texts},t);
  assert.equal(offer.requiresPartialApproval,false);assert.equal(offer.requiredBudgetUsd,offer.budgetUsd);
  assert.equal(confidenceApprovalReady(offer),true);
  const small=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:.01},t);
  assert.equal(small.canFitEstimatedFinding,false);
  assert.equal(confidenceApprovalReady({...small,partialApproved:true}),false);assert.equal(t.calls(),0);
});
test('approval UI displays actual forecast/ceiling and requires a deliberate checkbox',async()=>{
  const t=setup(),offer=await prepareConfidenceAllowance({caseId:'synthetic',texts},t);
  const url=new URL('../../src/ConfidenceAllowance.jsx',import.meta.url);
  const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
  const code=transformed.code.replaceAll('from "react/jsx-runtime"',`from "${import.meta.resolve('react/jsx-runtime')}"`);
  const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
  const html=renderToStaticMarkup(React.createElement(Component,{allowance:offer,analysisBudget:2}));
  assert.match(html,/Server limit: US \$1.00/);assert.match(html,/Estimated reserve: US \$/);
  assert.match(html,/US \$3.00/);assert.match(html,/may remain unchecked/);
  assert.doesNotMatch(html,/checked=""|guarantee|all findings will/);
});
