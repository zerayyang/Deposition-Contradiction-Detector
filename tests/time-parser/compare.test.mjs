import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect,reference,components} from './compare.mjs';

test('diagnostic retains unparsed input instead of correcting bare hours',()=>{
    const r=inspect('around 8');assert.equal(r.input,'around 8');assert.deepEqual(r.chronoMatches,[]);
    assert.equal(r.currentParser.missing,'AM_PM');
});
test('explicit versus inferred meridiem is exposed and not confused with confidence',()=>{
    const explicit=inspect('11:00 p.m.').chronoMatches[0].start;
    const implicit=inspect('5:15').chronoMatches[0].start;
    assert.equal(explicit.hour.value,23);assert.equal(explicit.meridiem.knownByChrono,true);
    assert.equal(implicit.meridiem.knownByChrono,false);assert.equal(implicit.year.knownByChrono,false);
    assert.equal(reference.instant.toISOString(),'2026-01-15T12:00:00.000Z');assert.equal(reference.timezone,0);
    assert.equal(components(undefined),null);
});
test('partial range match remains a partial result with literal offsets',()=>{
    const r=inspect('between 11 and midnight');assert.equal(r.chronoMatches.length,1);
    const m=r.chronoMatches[0];assert.equal(m.matchedText,'midnight');assert.equal(m.end,null);
    assert.equal(r.input.slice(m.index,m.index+m.matchedText.length),m.matchedText);
});
test('repeating a diagnostic under the fixed reference produces identical output',()=>{
    assert.deepEqual(inspect('from 11 p.m. to 1 a.m.'),inspect('from 11 p.m. to 1 a.m.'));
});
