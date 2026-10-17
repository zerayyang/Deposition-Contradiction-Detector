import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuantityRange} from './quantities.js';
import {literalActivityPhrase} from './rules.js';
import {assessCandidate} from '../humanConfidencePipeline.js';

// Synthetic phrases only. These cover reading "exactly N" and answers opening with Yes./No.;
// no weights, thresholds or rule outcomes change.

test('exactly/precisely read as the exact amount', () => {
  for (const [phrase, value] of [['exactly three', 3], ['Exactly 12', 12], ['precisely five', 5], ['exactly twenty-one', 21]]) {
    const range = parseQuantityRange(phrase);
    assert.equal(range.earliest, value, phrase);
    assert.equal(range.latest, value, phrase);
    assert.equal(range.widenedBy, 0, phrase);
  }
});

test('exactly mixed with an approximation, or without a number, stays unparsed', () => {
  for (const phrase of ['exactly about three', 'precisely around 4', 'exactly', 'exactly some', 'not exactly three'])
    assert.equal(parseQuantityRange(phrase), null, phrase);
});

test('plain and approximate amounts are unchanged', () => {
  assert.deepEqual(parseQuantityRange('three'), {earliest: 3, latest: 3, widenedBy: 0, unit: ''});
  assert.deepEqual(parseQuantityRange('about three'), parseQuantityRange('around three'));
  assert.equal(parseQuantityRange('at least three'), null);
});

test('exact counts of the same object conflict through the existing quantity rule', () => {
  const claim = (original, quantityPhrase) => ({original, quantityPhrase, objectPhrase: 'invoices', activityPhrase: 'signed',
    timePhrase: null, locationPhrase: null, personPhrase: null, statePhrase: null, qualifierPhrases: []});
  const t1 = 'Q: How many invoices did you sign?\nA: I signed exactly three invoices.';
  const t2 = 'Q: How many invoices did you sign?\nA: I signed exactly five invoices.';
  const result = assessCandidate({type: 'DIRECT', reasoning: 'x', claim1: claim('I signed exactly three invoices.', 'exactly three'), claim2: claim('I signed exactly five invoices.', 'exactly five')}, t1, t2);
  assert.ok(result.rulesFired.some(r => r.id === 'quantity' && r.verdict === 'CONFLICT'), JSON.stringify(result.rulesFired));
});

test('an opening Yes./No. before a first-person sentence is skipped, returning a literal suffix', () => {
  for (const [answer, phrase] of [['No. I did not leave the house.', 'I did not leave the house.'], ['Yes. I left the house.', 'I left the house.'], ['yes, I left the house.', 'I left the house.']]) {
    assert.equal(literalActivityPhrase(answer), phrase, answer);
    assert.ok(answer.includes(phrase));
  }
});

test('a bare or non first-person Yes./No. is not stripped, and existing limits still apply', () => {
  assert.equal(literalActivityPhrase('No.'), null);
  assert.equal(literalActivityPhrase('No. The house was empty.'), null);
  assert.equal(literalActivityPhrase('No. I did not leave. I stayed home.'), null);
  assert.equal(literalActivityPhrase('Yes. I left home to buy groceries.'), null);
  assert.equal(literalActivityPhrase('I did not leave the house.'), 'I did not leave the house.');
});
