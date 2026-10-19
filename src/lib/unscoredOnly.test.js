import test from 'node:test';
import assert from 'node:assert/strict';
import {unscoredOnlyCount} from './analysisStatus.js';

const unscored={reason:'A returned quote/extraction failed source validation; retained unscored for review.'};
test('a finished review whose only issues are unscored findings is not reported as incomplete',()=>{
 assert.equal(unscoredOnlyCount({status:'partial',tasks:[{status:'completed'}],issues:[unscored,unscored]}),2);
});
test('real failures still count as an incomplete review',()=>{
 assert.equal(unscoredOnlyCount({status:'partial',tasks:[{status:'partial'}],issues:[unscored]}),0,'a task with rejected findings');
 assert.equal(unscoredOnlyCount({status:'partial',tasks:[{status:'completed'},{status:'failed'}],issues:[unscored]}),0,'a failed section');
 assert.equal(unscoredOnlyCount({status:'partial',tasks:[{status:'completed'}],issues:[unscored,{reason:'Request timed out.'}]}),0,'another issue');
 assert.equal(unscoredOnlyCount({status:'complete',tasks:[{status:'completed'}],issues:[]}),0);
 assert.equal(unscoredOnlyCount(undefined),0);
});

test('a fully compared run whose only problem is dropped suggestions counts as complete',async()=>{
  const {droppedSuggestionCount,fullyCompared}=await import('./analysisStatus.js');
  const dropped={status:'partial',tasks:[{id:'0:0',status:'partial',stopReason:'end_turn',acceptedFindings:9,rejectedFindings:[{candidateIndex:3}]}],issues:[{pairId:'0:0',candidateIndex:3,reason:'A returned quotation is outside its submitted section.'}]};
  assert.equal(droppedSuggestionCount(dropped),1);assert.equal(fullyCompared(dropped),true);
  assert.equal(droppedSuggestionCount({...dropped,tasks:[...dropped.tasks,{id:'0:1',status:'failed',stopReason:null,rejectedFindings:[]}]}),0,'a section that failed is still partial');
  assert.equal(droppedSuggestionCount({...dropped,tasks:[{...dropped.tasks[0],stopReason:'max_tokens'}]}),0,'a cut-off reply is still partial');
  assert.equal(droppedSuggestionCount({...dropped,issues:[...dropped.issues,{pairId:'0:0',candidateIndex:9,reason:'Request timed out.'}]}),0,'another problem is still partial');
  assert.equal(fullyCompared({status:'complete'}),true);assert.equal(fullyCompared(undefined),false);
});
