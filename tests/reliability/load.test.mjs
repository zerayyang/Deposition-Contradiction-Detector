import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mockLoad} from './load.mjs';
test('mocked concurrent waves admit one analysis, reject overload before model work, and release all capacity',async()=>{
 const r=await mockLoad({waves:3,usersPerWave:12});assert.equal(r.attempts,36);assert.equal(r.completed,3);assert.equal(r.rejected,33);assert.equal(r.mockModelCalls,3);assert.equal(r.unexpectedErrors,0);assert.equal(r.allCapacityReleased,true);assert.equal(r.paidCalls,0);
});
