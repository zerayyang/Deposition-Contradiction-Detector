import test from 'node:test';
import assert from 'node:assert/strict';
import {detectWitnessName,compareWitnesses} from '../../shared/witnessName.js';

// Fictional captions only.
test('reads the witness from common caption lines',()=>{
  assert.equal(detectWitnessName('Deposition of Riley Morgan\nFirst session\nQ: Hello?')?.display,'Riley Morgan');
  assert.equal(detectWitnessName('Deposition of Marcus Webb — March 14, 2023\nQ: ...')?.display,'Marcus Webb');
  assert.equal(detectWitnessName('1 VIDEOTAPED DEPOSITION OF JANE Q. DOE, taken at')?.key,'JANE DOE');
  assert.equal(detectWitnessName('3 WITNESS: JANE Q. DOE PAGE\n4 EXAMINATION BY MR. SMITH 5')?.key,'JANE DOE');
  assert.equal(detectWitnessName('Testimony of Dr. Alan Price on behalf of')?.key,'ALAN PRICE');
});

test('ignores speaker labels, wrapped names and missing captions',()=>{
  assert.equal(detectWitnessName('Q: Name?\nTHE WITNESS: Yes. It is Jane Doe.'),null);
  assert.equal(detectWitnessName('5 Videotape deposition of JANE Q.\n6 DOE, taken'),null);
  assert.equal(detectWitnessName('Q: Where were you?\nA: At home.'),null);
  assert.equal(detectWitnessName(undefined),null);
});

test('two different names in one transcript are ambiguous',()=>{
  assert.equal(detectWitnessName('Deposition of Jane Doe\nDeposition of John Roe'),null);
});

test('compares the two transcripts: same, different or unknown',()=>{
  assert.equal(compareWitnesses('Deposition of Jane Q. Doe','DEPOSITION OF JANE DOE').status,'same');
  const different=compareWitnesses('Deposition of Jane Doe','Deposition of John Roe');
  assert.equal(different.status,'different');assert.deepEqual(different.names,['Jane Doe','John Roe']);
  assert.equal(compareWitnesses('Deposition of Jane Doe','Q: Hi?\nA: Hi.').status,'unknown');
});

test('same witness is assumed unless the captions name different people',async()=>{
  const {defaultSameWitness}=await import('../../shared/witnessName.js');
  assert.equal(defaultSameWitness(compareWitnesses('Deposition of Jane Doe','Deposition of Jane Doe')),true);
  assert.equal(defaultSameWitness(compareWitnesses('Q: Hi?\nA: Hi.','Q: Hi?\nA: Hi.')),true);
  assert.equal(defaultSameWitness(compareWitnesses('Deposition of Jane Doe','Deposition of John Roe')),false);
});
