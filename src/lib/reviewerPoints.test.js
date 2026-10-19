import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewerPoints} from './reviewerPoints.js';
test('reviewer concerns show at most three short excerpts without mutating saved text',()=>{
  const text=['First concern. Second concern. Third concern. Fourth concern.'];
  const before=[...text];assert.deepEqual(reviewerPoints(text),['First concern.','Second concern.','Third concern.']);assert.deepEqual(text,before);
  const long='A long concern '.repeat(30);const points=reviewerPoints([long]);assert.ok(points[0].length<=140);assert.ok(points[0].endsWith('…'));
});
