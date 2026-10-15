import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupHoliday} from './lookup.mjs';

test('Canada/BC dataset resolves fixed holidays for an explicit year',()=>{
    const r=lookupHoliday('Canada Day',2026);assert.equal(r.status,'FOUND');assert.equal(r.matches[0].localDateTime,'2026-07-01 00:00:00');
    assert.equal(lookupHoliday("New Year’s Day",2026).matches[0].localDateTime,'2026-01-01 00:00:00');
    assert.equal(r.usedForScoring,false);
});
test('regional and moving holidays use Canadian dates, not US dates',()=>{
    assert.equal(lookupHoliday('British Columbia Day',2026).matches[0].localDateTime,'2026-08-03 00:00:00');
    assert.equal(lookupHoliday('Thanksgiving',2026).matches[0].localDateTime,'2026-10-12 00:00:00');
    assert.equal(lookupHoliday('Thanksgiving',2025).matches[0].localDateTime,'2025-10-13 00:00:00');
});
test('unknown year and invalid input cannot silently use this year',()=>{
    assert.equal(lookupHoliday('Canada Day').status,'YEAR_REQUIRED');
    for(const y of [NaN,'2026',2026.5,0])assert.equal(lookupHoliday('Canada Day',y).status,'INVALID_YEAR');
    assert.equal(lookupHoliday('',2026).status,'INVALID_NAME');
});
test('New Year Eve uses an explicit application addition, without inventing a year',()=>{
    for(const year of [2025,2026,2027]) {
        const r=lookupHoliday("New Year’s Eve",year);
        assert.equal(r.status,'FOUND');
        assert.equal(r.matches[0].localDateTime,`${year}-12-31 00:00:00`);
        assert.equal(r.matches[0].source,'application Canadian additions');
        assert.equal(r.matches[0].type,'occasion');
        assert.equal(r.usedForScoring,false);
    }
    assert.equal(lookupHoliday("New Year's Eve").status,'YEAR_REQUIRED');
    assert.equal(lookupHoliday('Some unrecognized occasion',2026).status,'NOT_IN_DATASET');
});
