import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidate} from '../humanConfidencePipeline.js';
const claim=(original,timePhrase)=>({original,timePhrase,activityPhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const q='Q: When did you arrive on August 9th?\nA: ';
const run=(a,b,opts={})=>assessCandidate({type:opts.type??'DIRECT',claim1:a,claim2:b},(opts.q1??q)+a.original,(opts.q2??q)+b.original);
const clocks=(a,b,opts)=>run(claim(a,a),claim(b,b),opts);
const time=r=>r.rulesFired.find(x=>x.id==='time');

test('different exact clock values conflict across every AM/PM combination, independent of ordering',()=>{
    for(const [a,b] of [['5:15','6:45'],['6:45','5:15'],['12:15','1:45']]){
        const r=clocks(a,b);assert.equal(r.status,'CONFLICT_SUPPORTED');
        assert.equal(time(r).alternativeComparisons.length,4);
        assert.ok(time(r).alternativeComparisons.every(c=>c.verdict==='CONFLICT'));
        assert.equal(time(r).minimumGapMinutes,90);
    }
});
test('unknown period versus explicit night can establish a conflict without choosing a period',()=>{
    const r=run(claim('Around 6, I think. It was early.','Around 6'),claim('Around 10 at night, maybe a little after.','Around 10 at night'),{type:'INFERENTIAL'});
    assert.equal(r.status,'CONFLICT_SUPPORTED');assert.equal(time(r).alternativeComparisons.length,2);
    assert.equal(time(r).minimumGapMinutes,180);
});
test('mixed overlap and separation remain unresolved instead of assuming the same period',()=>{
    for(const [a,b] of [['Around 8','8:30'],['5:15','5:15'],['Around 11:45','midnight'],['around 8','8 pm']]){
        const r=clocks(a,b);assert.equal(r.status,'NOT_EVALUABLE',`${a} / ${b}`);
        assert.match(r.rulesLimiting.find(x=>x.id==='time').explanation,/interpretations disagree/);
    }
});
test('minimum possible gap determines evidence strength',()=>{
    const r=clocks('around 7','8 pm');
    assert.equal(r.status,'CONFLICT_SUPPORTED');assert.equal(time(r).minimumGapMinutes,30);
    assert.ok(r.evidenceStrength<1);assert.ok(r.score<90);
});
test('missing or different event anchors still prevent scoring and invalid evidence stays unverified',()=>{
    for(const opts of [{q1:'',q2:''},{q2:'Q: When did you arrive on August 10th?\nA: '}])assert.equal(clocks('5:15','6:45',opts).status,'NOT_EVALUABLE');
    const c=claim('5:15','5:15');const r=assessCandidate({type:'DIRECT',claim1:c,claim2:claim('6:45','6:45')},'A: No time given',q+'6:45');
    assert.equal(r.notEvaluableReason,'UNVERIFIED_SOURCE');assert.equal(r.score,null);
});
test('unsupported ranges and time bounds are not converted into simple clock alternatives',()=>{
    for(const a of ['between 11 and midnight','before 8','after 8','around 8, maybe 8:30'])assert.equal(clocks(a,'10 pm').status,'NOT_EVALUABLE',a);
});
test('exact source statements with boundary wording cannot masquerade as event times',()=>{
    const r=run(claim("I didn't arrive before 8.",'8'),claim('I arrived at 10 pm.','10 pm'));
    assert.equal(r.status,'NOT_EVALUABLE');
});
test('model classification never determines time scores',()=>{
    const scores=['DIRECT','INFERENTIAL','FALSE_POSITIVE'].map(type=>clocks('5:15','6:45',{type}).score);
    assert.equal(new Set(scores).size,1);assert.ok(Number.isFinite(scores[0]));
});
