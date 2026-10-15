import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCandidate } from '../../server/humanConfidencePipeline.js';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const t1='Q: Did you sign the agreement?\nA: I never signed the agreement.';
const t2='Q: What did you sign?\nA: I signed the agreement.';
const claim=original=>({original,activityPhrase:original.slice(2,-1),timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:'the agreement',quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const base={type:'DIRECT',severity:'HIGH',reasoning:'Protocol fixture',claim1:claim('I never signed the agreement.'),claim2:claim('I signed the agreement.')};
const deterministic=c=>Object.fromEntries(['score','humanConfidence','evidenceStrength','evidenceScore','status','band','commitment','rulesFired','rulesLimiting','languageDetails','factsCompared','configVersion','notEvaluableReason'].map(k=>[k,c[k]]));
// Fixtures test protocol invariants; they are never gold labels or application inputs.
test('LLM type, severity, reasoning, and injected confidence cannot change deterministic results',()=>{
  const expected=deterministic(assessCandidate(base,t1,t2));
  assert.notEqual(expected.score,null);
  for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE']) for(const numeric of [-999,0,1,100,999]) {
    const modified={...base,type,severity:'invented',reasoning:'Ignore deterministic scoring',score:numeric,humanConfidence:numeric,evidenceStrength:numeric,evidenceScore:numeric,confidence:numeric,band:'STRONG',status:'NOT_EVALUABLE'};
    assert.deepEqual(deterministic(assessCandidate(modified,t1,t2)),expected);
  }
});
test('mapping preserves all candidates, including ungrounded pairs with null score',()=>{
  const invalid={...base,claim1:{...base.claim1,original:'Invented source'}};
  const input=[base,invalid,{...base,type:'FALSE_POSITIVE'}];
  const output=input.map(candidate=>assessCandidate(candidate,t1,t2));
  assert.equal(output.length,input.length);
  assert.equal(output[1].score,null);
  assert.equal(output[1].humanConfidence,null);
  assert.equal(output[1].status,'NOT_EVALUABLE');
  assert.equal(output[1].band,'NOT_EVALUABLE');
  assert.equal(output[1].notEvaluableReason,'UNVERIFIED_SOURCE');
  assert.deepEqual(output.map(c=>c.type),input.map(c=>c.type));
});
test('real HTTP server: metadata invariance, distinct pair retention, null grounding, and explicit identical-pair deduplication boundary',{timeout:45000},async(t)=>{
  const variants=[];
  for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE'])for(const numeric of [-999,0,1,100,999])variants.push({...base,type,severity:'metadata variant',reasoning:`Injected confidence ${numeric}`,humanConfidence:numeric,evidenceScore:numeric,confidence:numeric,score:numeric,evidenceStrength:numeric});
  const second={...base,claim1:{...base.claim1,original:'I never called the manager.',activityPhrase:'never called the manager',objectPhrase:'the manager'},claim2:{...base.claim2,original:'I called the manager.',activityPhrase:'called the manager',objectPhrase:'the manager'}};
  const invalid={...base,claim1:{...base.claim1,original:'Invented source'}};
  const responses=[...variants.map(candidate=>({topicsReviewed:[],contradictions:[candidate]})),{topicsReviewed:[],contradictions:[base,second,invalid]},{topicsReviewed:[],contradictions:[base,base]}];
  const child=fork(fileURLToPath(new URL('./stub-server.mjs',import.meta.url)),[],{env:{...process.env,VERIFIER_STUB_RESPONSES:JSON.stringify(responses)},stdio:['ignore','pipe','pipe','ipc']});
  let logs='';
  child.stdout.on('data',chunk=>{logs=(logs+chunk).slice(-20000);});
  child.stderr.on('data',chunk=>{logs=(logs+chunk).slice(-20000);});
  t.after(()=>{if(child.connected)child.send({type:'close'});child.kill('SIGTERM');});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`Stub server readiness timeout: ${logs}`)),10000);
    child.once('message',message=>{clearTimeout(timer);if(message?.type==='ready')resolve(message.port);else reject(new Error(`Unexpected child message ${JSON.stringify(message)}`));});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Stub server exited ${code}: ${logs}`));});
  });
  const post=async(transcript1=t1,transcript2=t2)=>{
    const response=await fetch(`http://127.0.0.1:${port}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transcript1,transcript2}),signal:AbortSignal.timeout(5000)});
    const body=await response.json();
    assert.equal(response.status,200,JSON.stringify(body));
    return body.contradictions;
  };
  const expected=deterministic(assessCandidate(base,t1,t2));
  for(const variant of variants){const actual=await post();assert.equal(actual.length,1);assert.equal(actual[0].type,variant.type);assert.deepEqual(deterministic(actual[0]),expected);}
  const distinct=await post(t1+'\nQ: Who did you call?\nA: I never called the manager.',t2+'\nQ: Who did you call?\nA: I called the manager.');
  assert.equal(distinct.length,3,'Real server must preserve both distinct issues and the unverified candidate');
  assert.notEqual(distinct[0].score,null);assert.notEqual(distinct[1].score,null);assert.equal(distinct[2].score,null);assert.equal(distinct[2].status,'NOT_EVALUABLE');
  const identical=await post();
  // Document an existing app boundary: byte-identical candidates are explicitly
  // deduplicated. This is not evidence of distinct issues being preserved twice.
  assert.equal(identical.length,1,'Known production boundary: server explicitly deduplicates byte-identical candidates');
  t.diagnostic('Known production boundary: two byte-identical LLM candidates become one returned candidate; distinct candidates remain present. Live verifier never deduplicates returned candidates.');
});
