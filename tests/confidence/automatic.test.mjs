import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers,prepareConfidence} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';

const claim=original=>({original,qualifierPhrases:[],activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null});
const texts=['Q: How many that day?\nA: Exactly three.','Q: How many that day?\nA: Exactly five.'];
const finding=()=>({type:'DIRECT',claim1:claim('Exactly three.'),claim2:claim('Exactly five.')});
function setup({bad=false}={}) {
  let calls=0;
  const handlers=createConfidenceHandlers({callModel:async()=>{calls++;return {stop_reason:bad?'max_tokens':'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]};}});
  const fetchImpl=async(url,options)=>{
    const res=new EventEmitter();res.statusCode=200;res.status=n=>{res.statusCode=n;return res;};res.json=body=>{res.body=body;res.writableEnded=true;return res;};
    await handlers[url.split('/').at(-1)]({identity:{id:'synthetic-owner'},body:JSON.parse(options.body)},res);
    return {ok:res.statusCode===200,json:async()=>res.body};
  };
  return {fetchImpl,calls:()=>calls};
}
test('single approved flow automatically reviews findings and keeps original analysis fields',async()=>{
  const t=setup(),original=finding();original.humanConfidence=90;
  const allowance=await prepareConfidenceAllowance({caseId:'saved',texts,budgetUsd:2},t);
  assert.equal(t.calls(),0);let checkpoints=0;
  const result=await runAutomaticConfidence({findings:[original],texts,caseId:'saved',allowance,...t,onCheckpoint:async()=>{checkpoints++;}});
  assert.equal(t.calls(),7);assert.equal(result.checked,1);assert.equal(result.results[0].type,'DIRECT');
  assert.equal(result.results[0].humanConfidence,90);assert.equal(result.results[0].hybridConfidence.score,100);
  assert.equal(result.results[0].hybridConfidence.status,'EXPERIMENTAL');assert.ok(checkpoints>=7);
});
test('server allowance stops later findings before paid work and exposes partial confidence coverage',async()=>{
  const t=setup();const per=prepareConfidence({finding:finding(),texts}).budgetUsd;
  const allowance=await prepareConfidenceAllowance({caseId:'saved',texts,budgetUsd:per*1.5},t);
  const result=await runAutomaticConfidence({findings:[finding(),finding()],texts,caseId:'saved',allowance,...t});
  assert.equal(t.calls(),7);assert.equal(result.checked,1);assert.equal(result.status,'BUDGET_LIMIT');
  assert.equal(result.results[1].hybridConfidence.status,'BUDGET_LIMIT');assert.equal(result.results.length,2);
});
test('failed confidence does not remove or reclassify analysis findings and has no retry',async()=>{
  const t=setup({bad:true});const allowance=await prepareConfidenceAllowance({caseId:'saved',texts,budgetUsd:2},t);
  const result=await runAutomaticConfidence({findings:[finding(),finding()],texts,caseId:'saved',allowance,...t});
  assert.equal(t.calls(),1);assert.equal(result.status,'INCOMPLETE');assert.equal(result.results.length,2);
  assert.ok(result.results.every(f=>f.type==='DIRECT'&&f.hybridConfidence.score===null));
});
test('source rejection spends nothing on invalid finding but continues to the next valid one',async()=>{
  const t=setup();const allowance=await prepareConfidenceAllowance({caseId:'saved',texts,budgetUsd:2},t);
  const invalid=finding();invalid.claim1.original='An invented answer';
  const result=await runAutomaticConfidence({findings:[invalid,finding()],texts,caseId:'saved',allowance,...t});
  assert.equal(t.calls(),7);assert.equal(result.results[0].hybridConfidence.status,'SOURCE_REVIEW_REQUIRED');assert.equal(result.checked,1);
});
test('cancellation keeps completed votes, stops further requests and marks pending findings',async()=>{
  const t=setup(),controller=new AbortController();const allowance=await prepareConfidenceAllowance({caseId:'saved',texts,budgetUsd:2},t);
  const result=await runAutomaticConfidence({findings:[finding(),finding()],texts,caseId:'saved',allowance,...t,signal:controller.signal,onCheckpoint:async()=>controller.abort()});
  assert.equal(t.calls(),1);assert.equal(result.status,'CANCELLED');
  assert.equal(result.results[0].hybridConfidence.votes.length,1);assert.equal(result.results[1].hybridConfidence.status,'CANCELLED');
});
