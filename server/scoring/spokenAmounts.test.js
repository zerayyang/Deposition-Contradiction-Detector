import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCandidate } from '../humanConfidencePipeline.js';

// Fictional phrasing only. Spoken amounts reach the existing quantity rule; no
// weights, thresholds or bands change, and hypotheticals remain unscored.
const claim = (original, quantityPhrase) => ({ original, quantityPhrase, activityPhrase: null, timePhrase: null, locationPhrase: null,
  personPhrase: null, objectPhrase: null, statePhrase: null, qualifierPhrases: [] });
const score = (a, qa, b, qb) => assessCandidate({ type: 'INFERENTIAL', reasoning: 'x', claim1: claim(a, qa), claim2: claim(b, qb) },
  `Q: How much?\nA: ${a}`, `Q: How much?\nA: ${b}`);
const verdict = r => r.rulesFired.find(x => x.id === 'quantity')?.verdict;

test('a spoken range containing the other amount is compatible (index at most 15)', () => {
  const r = score('I think between a billion and a billion five.', 'between a billion and a billion five', 'It is worth 1.5 billion.', '1.5 billion');
  assert.equal(verdict(r), 'COMPATIBLE'); assert.ok(r.humanConfidence <= 15);
});

test('separated spoken amounts conflict', () => {
  assert.equal(verdict(score('We have 1230 some-odd acres.', '1230 some-odd acres', 'It is close to 2,000 acres.', 'close to 2,000 acres')), 'CONFLICT');
});

test('"$", "USD" and "dollars" are one currency; other currencies stay distinct', () => {
  assert.equal(verdict(score('I added tens of millions of dollars.', 'tens of millions of dollars', 'I added maybe $10 billion.', 'maybe $10 billion')), 'CONFLICT');
  assert.equal(verdict(score('It cost 2 billion dollars.', '2 billion dollars', 'It cost USD 2 billion.', 'USD 2 billion')), 'COMPATIBLE');
  const cad = score('It cost CAD 2 million.', 'CAD 2 million', 'It cost $9 million.', '$9 million');
  assert.notEqual(verdict(cad), 'CONFLICT');
});

test('hypothetical amounts stay unscored even when they can be read', () => {
  const r = score('I would have added tens of millions of dollars.', 'tens of millions of dollars', 'I would have added maybe $10 billion.', 'maybe $10 billion');
  assert.equal(r.humanConfidence, null); assert.equal(r.status, 'NOT_EVALUABLE');
});
