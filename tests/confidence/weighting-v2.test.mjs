import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeConfidence,CURRENT_COMBINATION_METHOD} from '../../shared/hybridConfidence.js';

const input=(agree=5)=>({originalType:'DIRECT',combinationMethod:CURRENT_COMBINATION_METHOD,
  evidence:{sourcesVerified:true,status:'CONFLICT_SUPPORTED',ruleSupported:true,ruleStrength:1},
  reviewer:{status:'SUCCESS',type:'DIRECT',objections:[]},
  votes:Array.from({length:6},(_,i)=>({model:i<3?'synthetic-a':'synthetic-b',permutation:i%3,status:'SUCCESS',type:i<agree?'DIRECT':'FALSE_POSITIVE'}))});
test('new combination is 60 votes, 30 reviewer and 10 code with a versioned breakdown',()=>{
  const value=summarizeConfidence(input());
  assert.equal(value.score,90);assert.equal(value.combination.method,'fixed-weight-v2');
  assert.deepEqual([value.combination.permutation.max,value.combination.reviewer.max,value.combination.code.max],[60,30,10]);
  const partial=input();partial.reviewer.objections=['Synthetic context concern'];
  assert.equal(summarizeConfidence(partial).score,75);
  partial.reviewer.type='FALSE_POSITIVE';assert.equal(summarizeConfidence(partial).score,60);
});
test('code contribution cannot exceed ten points and missing code is excluded transparently',()=>{
  const value=input(2);value.reviewer.type='FALSE_POSITIVE';
  value.evidence={sourcesVerified:true,status:'NOT_EVALUABLE',ruleStrength:0};
  const result=summarizeConfidence(value);
  assert.equal(result.score,22);assert.equal(result.combination.code.points,null);assert.equal(result.combination.availablePoints,90);
  value.evidence={sourcesVerified:true,status:'CONFLICT_SUPPORTED',ruleStrength:.5};
  assert.equal(summarizeConfidence(value).combination.code.points,5);
});
test('source or incomplete-model failures still block the new score',()=>{
  const value=input(6);value.evidence.sourcesVerified=false;assert.equal(summarizeConfidence(value).score,null);
  value.evidence.sourcesVerified=true;value.votes.pop();assert.equal(summarizeConfidence(value).score,null);
});
test('legacy policy remains reproducible and unsupported policy cannot silently pass',()=>{
  const value=input(2);value.reviewer.type='FALSE_POSITIVE';value.evidence={sourcesVerified:true,status:'NOT_EVALUABLE',ruleStrength:0};
  delete value.combinationMethod;assert.equal(summarizeConfidence(value).score,25);
  value.combinationMethod='unknown-policy';assert.equal(summarizeConfidence(value).status,'INVALID_COMBINATION');
});
