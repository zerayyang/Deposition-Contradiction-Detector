import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResponse,decisionEvidence} from '../../server/confidence/handlers.js';
import {combineConfidence} from '../../shared/hybridConfidence.js';

// Fictional testimony only.
const texts=['Q: How big is the site?\nA: It is 1230 some-odd acres.','Q: How big is the site?\nA: It is close to 2,000 acres.'];
const decision=(over={})=>({sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',
  conflictForm:'NON_OVERLAPPING_APPROXIMATIONS',value1:'1230 some-odd acres',value2:'close to 2,000 acres',missingFact:'',...over});
const message=value=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});

test('a check answers the decision questions and code picks its category with the shared rules',()=>{
  const answer=parseResponse(message({decision:decision(),objections:[]}),texts);
  assert.equal(answer.type,'DIRECT','far-apart estimates are Direct for the checks too');
  assert.equal(parseResponse(message({decision:decision({value2:'about 1,300 acres'}),objections:[]}),['A: 1230 some-odd acres','A: about 1,300 acres']).type,'FALSE_POSITIVE');
  assert.equal(parseResponse(message({type:'INFERENTIAL',objections:['old format']}),texts).type,'INFERENTIAL','older saved answers still read');
  assert.throws(()=>parseResponse(message({decision:decision(),objections:[],type:'DIRECT'}),texts),/INVALID_RESPONSE/);
});
test('the code part counts what code itself checked',()=>{
  const finding={type:'DIRECT',decision:decision()};
  assert.deepEqual(decisionEvidence(finding,texts),{sourcesVerified:true,source:'decision-code',ruleSupported:true,ruleStrength:0.9,status:'CONFLICT_SUPPORTED'});
  assert.equal(decisionEvidence({type:'INFERENTIAL',decision:decision()},texts),null,'a label the rules would not give gets no code support');
  assert.equal(decisionEvidence({type:'DIRECT'},texts),null,'no decision: older rules engine is used');
  const all={originalType:'DIRECT',agreement:1,reviewer:{type:'DIRECT',objections:[]},evidence:decisionEvidence(finding,texts),method:'fixed-weight-v2'};
  assert.equal(combineConfidence(all).score,99,'6/6 votes + reviewer + far-apart code check');
});
