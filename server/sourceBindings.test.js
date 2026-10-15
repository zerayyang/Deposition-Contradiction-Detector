import {test} from 'node:test';
import assert from 'node:assert/strict';
import {witnessQuoteMatches,resolveWitnessSource} from './sourceEvidence.js';
import {assessCandidate} from './humanConfidencePipeline.js';
import {pdfQuoteMap} from './pdfQuoteGrounding.js';
const claim=(original,extra={})=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[],...extra});
const text='Q: Did you hold the director role in 2016?\nA: Yes.\nMR. ADVOCATE: Yes.\nTHE COURT: Yes.\nQ: Did you sign the lease in 2017?\nA: Yes.\nMS. COUNSEL: I signed the lease.\nTHE WITNESS: I do not recall.';
test('explicit counsel and court turns terminate witness spans without losing later witness speech',()=>{
 const matches=witnessQuoteMatches(text,'Yes.');assert.equal(matches.length,2);
 assert.equal(witnessQuoteMatches(text,'I signed the lease.').length,0);
 assert.equal(witnessQuoteMatches(text,'I do not recall.').length,1);
 assert.equal(witnessQuoteMatches(text,'Yes.\nMR. ADVOCATE: Yes.').length,0);
});
test('question literal binds a repeated answer to exactly one witness occurrence and preserves context',()=>{
 const got=resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Did you sign the lease in 2017?',sourceAnswer:'Yes.'}));
 assert.equal(got.status,'BOUND');assert.equal(got.matchCount,2);assert.equal(got.selected.start,text.lastIndexOf('A: Yes.')+3);
 assert.equal(got.selected.question,'Did you sign the lease in 2017?');assert.equal(got.selected.answer,'Yes.');
 assert.equal(text.slice(got.selected.start,got.selected.end),'Yes.');
});
test('missing or repeated context stays ambiguous; wrong or invented context fails closed even for a unique quote',()=>{
 assert.equal(resolveWitnessSource(text,claim('Yes.')).status,'AMBIGUOUS');
 assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Did you'})).status,'AMBIGUOUS');
 assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Invented question'})).status,'ANCHOR_MISMATCH');
 assert.equal(resolveWitnessSource(text,claim('I do not recall.',{sourceAnswer:'A fabricated answer.'})).status,'ANCHOR_MISMATCH');
 assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceAnswer:34})).status,'ANCHOR_MISMATCH');
});
test('longer literal answer resolves a repeated fragment but cannot join noncontiguous passages',()=>{
 const t='Q: Did you know the vendor?\nA: I do not know. I would need to ask.\nQ: Who approved it?\nA: I do not know. The manager handled it.';
 const got=resolveWitnessSource(t,claim('I do not know.',{sourceAnswer:'I do not know. The manager handled it.'}));
 assert.equal(got.status,'BOUND');assert.match(got.selected.question,/Who approved/);
 assert.equal(resolveWitnessSource(t,claim('I do not know.',{sourceAnswer:'I do not know. The manager would need to ask.'})).status,'ANCHOR_MISMATCH');
});
test('submitted-section restriction never cites an identical answer in another section',()=>{
 const start=text.indexOf('Q: Did you sign');
 const got=resolveWitnessSource(text,claim('Yes.'),{start,end:text.length});
 assert.equal(got.status,'BOUND');assert.ok(got.selected.start>start);
 assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'director role'}),{start,end:text.length}).status,'ANCHOR_MISMATCH');
});
test('PDF literal anchors permit confirmed layout normalization but never paraphrases',()=>{
 const t='1 Q Did you sign the 10:00:00\n2 office lease? 10:00:01\n3 A Yes, I signed it. 10:00:02\n4 Q Did you read it? 10:00:03\n5 A Yes, I signed it. 10:00:04';
 const map=pdfQuoteMap(t,{pages:[{start:0,end:t.length}]});
 const got=resolveWitnessSource(t,claim('Yes, I signed it.',{sourceQuestion:'Did you sign the office lease?',sourceAnswer:'Yes, I signed it.'}),{map});
 assert.equal(got.status,'BOUND');assert.match(got.selected.question,/10:00:00/);
 assert.equal(resolveWitnessSource(t,claim('Yes, I signed it.',{sourceQuestion:'Did you sign the rental contract?'}),{map}).status,'ANCHOR_MISMATCH');
});
test('unresolved sources and forged bindings never activate a numeric score',()=>{
 const t='Q: On Monday, what happened?\nA: I signed the lease.\nQ: On Tuesday, what happened?\nA: I signed the lease.';
 const other='Q: On Monday, what happened?\nA: I did not sign the lease.';
 const a=claim('I signed the lease.',{activityPhrase:'signed the lease'}),b=claim('I did not sign the lease.',{activityPhrase:'did not sign the lease'});
 const base={type:'DIRECT',claim1:a,claim2:b,sourceBindings:{claim1:{status:'BOUND'}}};
 const unresolved=assessCandidate(base,t,other);assert.equal(unresolved.score,null);assert.equal(unresolved.notEvaluableReason,'MISSING_CONTEXT');
 const bad=assessCandidate({...base,claim1:{...a,sourceQuestion:'An invented question'}},t,other);
 assert.equal(bad.claim1Valid,false);assert.equal(bad.score,null);assert.equal(bad.notEvaluableReason,'UNVERIFIED_SOURCE');
 const bound={...base,claim1:{...a,sourceQuestion:'On Monday, what happened?'}};
 const score=assessCandidate(bound,t,other);assert.equal(score.status,'CONFLICT_SUPPORTED');
 assert.deepEqual(assessCandidate({...bound,type:'FALSE_POSITIVE',severity:'LOW',reasoning:'Different model opinion'},t,other).score,score.score);
});
