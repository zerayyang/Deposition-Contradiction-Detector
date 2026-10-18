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
