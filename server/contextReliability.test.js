import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedQuestionContext,conditionalAssertion} from './sourceContext.js';
import {assessCandidate} from './humanConfidencePipeline.js';
const claim=(original,fields={})=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[],...fields});
test('current event dates override older dates; current-status questions never inherit a formation year',()=>{
 assert.equal(boundedQuestionContext(['Was the company formed on May 15, 1980?','Who is the CFO now?']),'Who is the CFO now?');
 assert.equal(boundedQuestionContext(['Where were you on Monday evening?','Where were you on Tuesday?']),'Where were you on Tuesday?');
 assert.equal(boundedQuestionContext(['Was the statement dated June 3?','Did you sign the lease?']),'Did you sign the lease?');
});
test('nearby explicit follow-ups retain anchors, but topic resets and distant dates stop inheritance',()=>{
 assert.match(boundedQuestionContext(['What happened on Monday evening?','What time did you leave that evening?']),/Monday evening/);
 assert.doesNotMatch(boundedQuestionContext(['What happened on Monday?','Move on to another matter.','What time did you leave?']),/Monday/);
 assert.doesNotMatch(boundedQuestionContext(['What happened on Monday?','Who?','Where?','Why?','How?','What time?']),/Monday/);
});
test('idiomatic hedges and explicit habitual would differ from genuine hypotheticals',()=>{
 assert.equal(conditionalAssertion({original:'I would say I signed the lease.'}),false);
 assert.equal(conditionalAssertion({original:'I would look at them.',sourceQuestion:'Did you review them each year?'}),false);
 for(const original of ['If it rained, I signed the lease.','I would say I signed it if approved.','I would have signed it.','I would sign it.','Unless it rained, I left.'])assert.equal(conditionalAssertion({original}),true,original);
 assert.equal(conditionalAssertion({original:'I would review it every year.',sourceQuestion:'If appointed, what would you do?'}),true);
});
test('idiomatic would-say no longer blocks an explicit action, but if still blocks and model labels cannot set scores',()=>{
 const a='I would say I signed the north lease.',b='I did not sign the north lease.';
 const c={type:'DIRECT',claim1:claim(a,{activityPhrase:'signed the north lease'}),claim2:claim(b,{activityPhrase:'did not sign the north lease'})};
 const texts=[`Q: What did you do on Monday?\nA: ${a}`,`Q: What did you do on Monday?\nA: ${b}`];
 const r=assessCandidate(c,...texts);assert.equal(r.status,'CONFLICT_SUPPORTED');
 assert.equal(assessCandidate({...c,type:'FALSE_POSITIVE',severity:'LOW',reasoning:'Different opinion'},...texts).score,r.score);
 const conditional='I would say I signed the north lease if approved.';
 assert.equal(assessCandidate({...c,claim1:claim(conditional,{activityPhrase:'signed the north lease'})},`Q: What happened on Monday?\nA: ${conditional}`,texts[1]).score,null);
});
