import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createConfidenceHandlers} from '../../server/confidence/handlers.js';
import {prepareConfidenceAllowance,runAutomaticConfidence} from '../../src/lib/confidenceClient.js';

// Synthetic fixtures only. Each mocked check takes about 5 ms.
const texts=['Q: Did you sign the sample?\nA: I signed it.','Q: Did you sign the sample?\nA: I did not sign it.'];
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
test('each finding records how long its confidence score took',async()=>{
  const handlers=createConfidenceHandlers({callModel:async()=>{await new Promise(r=>setTimeout(r,5));
    return {stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify({type:'DIRECT',objections:[]})}]};}});
  const fetchImpl=async(url,{body})=>{const res=new EventEmitter();res.code=200;res.status=c=>{res.code=c;return res;};res.json=v=>{res.value=v;res.writableEnded=true;return res;};
    await handlers[url.split('/').at(-1)]({body:JSON.parse(body),identity:{id:'synthetic-owner'}},res);return {ok:res.code===200,json:async()=>res.value};};
  const allowance=await prepareConfidenceAllowance({caseId:'synthetic',texts,budgetUsd:3},{fetchImpl});
  const result=await runAutomaticConfidence({findings:[{type:'DIRECT',claim1:claim('I signed it.'),claim2:claim('I did not sign it.')}],texts,caseId:'synthetic',allowance,fetchImpl,concurrency:2,onCheckpoint:async()=>{}});
  const c=result.results[0].hybridConfidence;
  assert.equal(result.status,'FINISHED');assert.ok(Number.isFinite(c.startedAt));
  assert.ok(c.durationMs>=30,'seven checks of about 5 ms each');assert.ok(c.durationMs<10000);
});
