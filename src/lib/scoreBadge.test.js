import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreBadge } from './scoreBadge.js';

test('score badge reads plainly for conflicts, compatible pairs and missing scores', () => {
  assert.deepEqual(scoreBadge({ type: 'DIRECT', humanConfidence: 62, band: 'MODERATE' }), { kind: 'conflict', value: '62', text: '62 / 100 confidence · moderate' });
  assert.equal(scoreBadge({ type: 'FALSE_POSITIVE', humanConfidence: 10 }).kind, 'compatible');
  assert.equal(scoreBadge({ type: 'INFERENTIAL', humanConfidence: null }).kind, 'none');
});
