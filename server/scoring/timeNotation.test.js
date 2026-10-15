import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeRange} from './parsers.js';
import {assessCandidate} from '../humanConfidencePipeline.js';
const claim=(original,timePhrase)=>({original,timePhrase,activityPhrase:'My shift ended',locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const question='Q: What time did your shift end on December 12th?\nA: ';
const assess=(a,b)=>assessCandidate({type:'DIRECT',claim1:a,claim2:b},question+a.original,question+b.original);

test('explicit dotted and spaced meridiems equal plain notation without changing noon/midnight',()=>{
    for(const [phrase,expected] of [['11:00 p.m.',1380],['7:00 P.M.',1140],['7:00 p. m.',1140],['7:00 p m',1140],['7:00 A.M.',420],['12:00 a.m.',0],['12:00 p.m.',720]]) {
        const r=parseTimeRange(phrase);assert.equal(r?.earliest,expected,phrase);assert.equal(r.latest,expected,phrase);
    }
    assert.deepEqual(parseTimeRange('7:00 p.m. on the 12th'),parseTimeRange('7:00 pm'));
});
test('explicit same-phrase night and dayparts qualify the clock without inventing AM/PM',()=>{
    assert.equal(parseTimeRange('Around 10 at night').earliest,22*60-30);
    assert.equal(parseTimeRange('10 in the evening').earliest,22*60);
    assert.equal(parseTimeRange('10 in the morning').earliest,10*60);
    assert.equal(parseTimeRange('2 in the afternoon').earliest,14*60);
    assert.equal(parseTimeRange('12:30 at night').earliest,30);
    assert.equal(parseTimeRange('2 at night').missing,'AM_PM');
    assert.equal(parseTimeRange('around 6').missing,'AM_PM');
});
test('unrelated later clause or sentence cannot provide a clock meridiem',()=>{
    const a=claim('My shift ended around 8. It rained at night.','around 8');
    const b=claim('My shift ended at 8 pm.','8 pm');
    assert.equal(assess(a,b).status,'NOT_EVALUABLE');
    for(const phrase of ['around 8, but it rained at night','around 8. It rained at night','around 8 and I drove at night'])assert.equal(parseTimeRange(phrase).missing,'AM_PM',phrase);
});
test('conflicting question dayparts cannot silently default to PM',()=>{
    assert.equal(parseTimeRange('8',{text:'Was it morning or evening?'}).missing,'AM_PM');
    assert.equal(parseTimeRange('8',{text:'It was late.'}).missing,'AM_PM');
    assert.equal(parseTimeRange('8 pm',{text:'Was it morning or evening?'}).earliest,20*60);
});
test('explicit shift-time evidence now scores like equivalent plain notation',()=>{
    const a=claim('My shift ended at 11:00 p.m.','11:00 p.m.');
    const b=claim('My shift ended at 7:00 p.m. on the 12th.','7:00 p.m. on the 12th');
    const r=assess(a,b);assert.equal(r.status,'CONFLICT_SUPPORTED');
    assert.equal(r.score,assess(claim('My shift ended at 11:00 pm.','11:00 pm'),claim('My shift ended at 7:00 pm.','7:00 pm')).score);
    assert.equal(a.original,'My shift ended at 11:00 p.m.');assert.equal(r.claim1.timePhrase,'11:00 p.m.');
});
test('dotted intervals retain trailing meridiem and overnight behavior',()=>{
    assert.deepEqual(parseTimeRange('between 7 and 9 p.m.'),parseTimeRange('between 7 and 9 pm'));
    const r=parseTimeRange('from 11 p.m. to 1 a.m.');assert.equal(r.earliest,23*60);assert.equal(r.latest,25*60);
});
test('unsupported dates, durations, ambiguous clocks and invalid explicit periods remain unscored',()=>{
    for(const p of ['November 3rd','20 minutes','13 p.m.'])assert.equal(parseTimeRange(p),null,p);
    for(const p of ['5:15','around 7','between 11 and midnight'])assert.equal(parseTimeRange(p).missing,'AM_PM',p);
});

test('other wording in the same clause cannot supply AM/PM; attached source daypart can',()=>{
    const b=claim('My shift ended at 8 pm.','8 pm');
    const a=claim('My shift ended around 8 while someone worked at night.','around 8');
    assert.equal(assess(a,b).status,'NOT_EVALUABLE');
    const attached=assess(claim('My shift ended at 10 at night.','10'),b);
    assert.notEqual(attached.status,'NOT_EVALUABLE');
    assert.equal(attached.rulesFired.find(r=>r.id==='time').ranges[0].earliest,22*60);
});
