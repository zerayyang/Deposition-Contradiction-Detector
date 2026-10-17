import test from 'node:test';import assert from 'node:assert/strict';
import {evidenceTokens,shingleCoverage} from './fidelity.mjs';
test('fixed shingle policy removes bracket punctuation and omissions without removing words',()=>{
 assert.deepEqual(evidenceTokens('A [synthetic] … record...'),['a','synthetic','record']);
 assert.equal(shingleCoverage('One two three four five six','One two three four five six'),1);
 assert.equal(shingleCoverage('One two [three] ... four five six','One two three four five six'),1);
 assert.ok(shingleCoverage('One two wrong four five six','One two three four five six')<0.9);
});
test('short fragments require exact token presence and empty evidence fails',()=>{
 assert.equal(shingleCoverage('Yes.','A: Yes.'),1);assert.equal(shingleCoverage('No.','A: Yes.'),0);assert.equal(shingleCoverage('No.','Nobody answered.'),0);assert.equal(shingleCoverage('','anything'),0);
});
