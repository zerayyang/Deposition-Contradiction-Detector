import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';

// Synthetic fixtures only. The first model call fails (as if the provider timed out); the rest succeed.
const texts=['Q: Did you sign the sample?\nA: I signed it.','Q: Did you sign the sample?\nA: I did not sign it.'];
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding=()=>({type:'DIRECT',claim1:claim('I signed it.'),claim2:claim('I did not sign it.')});
test('a failed finding releases its reservation and every other finding is still scored',async()=>{
  let calls=0;
  const handlers=createConfidenceHandlers({callModel:async()=>{const n=++calls;await new Promise(r=>setTimeout(r,2));
    return {stop_reason:n===1?'max_tokens':'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]};}});
  const fetchImpl=async(url,{body})=>{const res=new EventEmitter();res.code=200;res.status=c=>{res.code=c;return res;};res.json=v=>{res.value=v;res.writableEnded=true;return res;};
    await handlers[url.split('/').at(-1)]({body:JSON.parse(body),identity:{id:'synthetic-owner'}},res);return {ok:res.code===200,json:async()=>res.value};};
  const allowance=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:6},{fetchImpl});
  const result=await runAutomaticConfidence({findings:Array.from({length:5},finding),texts,caseId:'synthetic',allowance,fetchImpl,concurrency:2,onCheckpoint:async()=>{}});
  assert.equal(result.incomplete,1);assert.equal(result.checked,4,'the other four findings are scored');
  assert.equal(calls,1+4*7,'the failed check is not retried');assert.equal(result.status,'INCOMPLETE');
});
