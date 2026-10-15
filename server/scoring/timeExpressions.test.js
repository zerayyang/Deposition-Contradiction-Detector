import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessCandidate} from '../humanConfidencePipeline.js';
import {parseEventExpression} from './timeExpressions.js';
import {parseClockAlternatives} from './parsers.js';
import {SCORING_CONFIG} from './config.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/time-response-regressions.json',import.meta.url),'utf8')).cases;
const claim=(original,timePhrase=original,activityPhrase=null)=>({original,timePhrase,activityPhrase,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const q='Q: When did you leave on June 18th?\nA: ';
const run=(a,b,question=q)=>assessCandidate({type:'FALSE_POSITIVE',claim1:a,claim2:b},question+a.original,question+b.original);
test('replay all four saved returned candidates plus separate hypothetical game candidate',()=>{
 for(const f of fixtures){
  const r=assessCandidate(f.candidate,f.request.transcript1,f.request.transcript2);
  assert.equal(r.status,f.expected_status,f.id);assert.equal(r.claim1Valid,true);assert.equal(r.claim2Valid,true);
  if(r.status==='CONFLICT_SUPPORTED')assert.equal(r.score,90);
  else {assert.ok(r.score<=15);assert.ok(r.rulesFired.some(x=>x.id==='time'));}
 }
});
test('compound estimates and or-so widen once and retain both AM/PM interpretations',()=>{
 const a=parseEventExpression('Around 8, maybe 8:30',{},SCORING_CONFIG),b=parseEventExpression('8:30 or so',{},SCORING_CONFIG);
 assert.equal(a.alternatives.length,2);assert.equal(b.alternatives.length,2);
 assert.equal(a.alternatives[0].earliest,450);assert.equal(a.alternatives[0].latest,540);
 assert.equal(b.alternatives[0].earliest,480);assert.equal(b.alternatives[0].latest,540);
 const f=fixtures.find(f=>f.id==='approx-clock-overlap-bar');const r=assessCandidate(f.candidate,f.request.transcript1,f.request.transcript2);
 const outcomes=new Set(r.rulesFired[0].alternativeComparisons.map(x=>x.verdict));
 assert.deepEqual([...outcomes].sort(),['COMPATIBLE','CONFLICT']);
 assert.match(r.rulesLimiting.map(x=>x.explanation).join(' '),/not a uniquely known time/);
});
test('departure bound is symmetric, works with explicit periods, and is not a blanket denial',()=>{
 for(const [a,b] of [[claim("I didn't leave before midnight.",'before midnight',"didn't leave"),claim('I left around 12:30.','around 12:30','left')],[claim('I did not depart before noon.','before noon'),claim('I departed at 1 pm.','1 pm')]]){
  for(const pair of [[a,b],[b,a]])assert.equal(run(...pair).status,'COMPATIBLE_SUPPORTED');
 }
});
test('unsupported bounds, denials, unrelated events and ungrounded claims never gain compatibility',()=>{
 for(const text of ["I didn't leave after midnight.","I never said I didn't leave before midnight.","I didn't leave before midnight, except once."]){
  assert.equal(run(claim(text,'midnight'),claim('I left around 12:30.','around 12:30')).status,'NOT_EVALUABLE',text);
 }
 assert.equal(run(claim("I didn't leave before midnight.",'before midnight'),claim("I didn't leave around 12:30.",'around 12:30')).status,'NOT_EVALUABLE');
 const f=fixtures.find(f=>f.id==='approx-clock-overlap-bar');
 assert.equal(assessCandidate(f.candidate,f.request.transcript1,f.request.transcript2.replace('Saturday','Sunday')).status,'NOT_EVALUABLE');
 const invalid=assessCandidate(f.candidate,'A: Something else',f.request.transcript2);assert.equal(invalid.score,null);
});
test('structured windows do not become single-clock alternatives or continuous activity evidence',()=>{
 assert.equal(parseClockAlternatives('between 11 and midnight'),null);
 const a=claim('I was asleep from 9 pm to 10 pm.','from 9 pm to 10 pm');
 const b=claim('I watched TV at 9:30 pm.','9:30 pm');
 const r=run(a,b);assert.equal(r.status,'CONFLICT_SUPPORTED');assert.ok(!r.rulesFired.some(x=>x.id==='time'&&x.verdict==='COMPATIBLE'));
});
test('nonoverlapping structured windows cannot be labeled compatible by this rule',()=>{
 assert.equal(run(claim('between 9 pm and 10 pm'),claim('11 pm')).status,'NOT_EVALUABLE');
 assert.equal(run(claim("I didn't leave before midnight.",'before midnight'),claim('I left at 11 pm.','11 pm')).status,'NOT_EVALUABLE');
});
test('classification, reasoning and semantic metadata cannot choose a verdict or score',()=>{
 const f=fixtures.find(f=>f.id==='negation-scope-midnight');
 const values=['DIRECT','INFERENTIAL','FALSE_POSITIVE'].map(type=>assessCandidate({...f.candidate,type,reasoning:'Changed opinion',semanticAssist:{relationship:'UNRELATED'}},f.request.transcript1,f.request.transcript2));
 assert.equal(new Set(values.map(x=>x.score)).size,1);assert.ok(values.every(x=>x.status==='COMPATIBLE_SUPPORTED'));
});
test('unsupported diagnostics expose rejected-rule reasons rather than an empty list',()=>{
 const r=run(claim("I didn't leave after midnight.",'after midnight'),claim('I left at 11 pm.','11 pm'));
 assert.equal(r.status,'NOT_EVALUABLE');assert.ok(r.rulesLimiting.some(x=>x.reason==='UNSUPPORTED_PATTERN'));
});
