import test from 'node:test';
import assert from 'node:assert/strict';
import { shortRule, firstSentence, findingTitle } from './shortLabels.js';

test('rules become a few words', () => {
  assert.equal(shortRule('Direct conflict: affirm vs deny.'), 'Said yes, then no');
  assert.equal(shortRule('Conflict by inference: requires inference.'), 'Needs inference');
  assert.equal(shortRule("Both can be true: uncertain recollection, supplied by the witness's words."), 'Compatible: uncertain recollection');
  assert.equal(shortRule('Code check: different exact times "8 PM" and "11 PM".'), 'Numbers differ');
  assert.equal(shortRule('Code check: approximate quantities "1230 some-odd acres" and "close to 2,000 acres" do not overlap.'), "Estimates don't overlap");
  assert.equal(shortRule('Code check: the times "around 8 PM" and "8:15 PM" overlap.'), 'Numbers overlap');
  assert.equal(shortRule(null), null);
});
test('summary is one sentence and titles prefer the AI headline', () => {
  assert.equal(firstSentence('First point. Second point.'), 'First point.');
  assert.equal(findingTitle({ headline: 'Time he left' }), 'Time he left');
  assert.equal(findingTitle({ claim1: { original: 'I left at eight.' } }), '“I left at eight.”');
});
