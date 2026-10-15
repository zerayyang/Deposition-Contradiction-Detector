import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseQuantityRange as parse} from './parsers.js';
const range=(a,b,unit)=>({earliest:a,latest:b,widenedBy:0,unit});
test('thousands separators preserve full acreage, currency and decimal values',()=>{
 assert.deepEqual(parse('2,000 acres'),range(2000,2000,'acres'));
 assert.deepEqual(parse('1,230 acres'),range(1230,1230,'acres'));
 assert.deepEqual(parse('1,236 acres'),range(1236,1236,'acres'));
 assert.deepEqual(parse('$1,234,567.50'),range(1234567.5,1234567.5,'$'));
});
test('million and billion scales apply to digits and explicit number words',()=>{
 for(const [s,n] of [['2.93 billion dollars',2.93e9],['twenty million dollars',20e6],['a billion dollars',1e9],['two million three hundred thousand dollars',2300000]])assert.deepEqual(parse(s),range(n,n,'dollars'));
 assert.deepEqual(parse('one hundred and twenty people'),range(120,120,'people'));
 assert.deepEqual(parse('twenty-five people'),range(25,25,'people'));
});
test('explicit ranges share trailing scale while different scales remain distinct',()=>{
 assert.deepEqual(parse('between 1 and 1.5 billion dollars'),range(1e9,1.5e9,'dollars'));
 assert.deepEqual(parse('1 billion to 1.5 billion dollars'),range(1e9,1.5e9,'dollars'));
 assert.deepEqual(parse('2 million to 1 billion dollars'),range(2e6,1e9,'dollars'));
 assert.deepEqual(parse('three or four people'),range(3,4,'people'));
});
test('approximation uses existing configured widening; no new score weights or calibration',()=>{
 assert.deepEqual(parse('close to 2,000 acres'),{earliest:1600,latest:2400,widenedBy:400,unit:'acres'});
 assert.deepEqual(parse('about ten people'),{earliest:8,latest:12,widenedBy:2,unit:'people'});
});
test('ambiguous shorthand, vague magnitudes, malformed commas and unsupported bounds are never silently coerced',()=>{
 for(const s of ['tens of millions of dollars','a billion five','between a billion and a billion five','2,00 acres','20,00,000 dollars','one two people','1 billion to 2 dollars','one million and ten dollars','1,000.2.3 dollars','over 2,000 acres','at least 2,000 acres','50%','12:30','June 3','-20 dollars','3/4 acre','2,000 some-odd acres'])assert.equal(parse(s),null,s);
});
test('currencies are kept distinct and unsupported phrases cannot become a unitless number',()=>{
 assert.equal(parse('CAD 2 million').unit,'cad');assert.equal(parse('USD 2 million').unit,'usd');
 assert.notEqual(parse('CAD 2 million').unit,parse('USD 2 million').unit);
 assert.equal(parse('there were 2,000 acres'),null);
});
