import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretValidatedTime,summarizeChronoTime} from './chronoTime.js';
import {assessCandidate} from './humanConfidencePipeline.js';
import {scoreFacts} from './scoring/engine.js';
import {TestimonyFact} from './TestimonyFact.js';
const claim=(original,timePhrase)=>({original,timePhrase,activityPhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const fact=time=>({time,ambiguousSource:false});

test('Chrono serializes explicit and inferred values separately using a synthetic reference',()=>{
    const known=interpretValidatedTime(fact('11:00 p.m.'),true),implied=interpretValidatedTime(fact('5:15'),true);
    assert.equal(known.status,'PARSED');assert.equal(known.matches[0].start.hour.value,23);
    assert.equal(known.matches[0].start.meridiem.knownByChrono,true);
    assert.equal(implied.matches[0].start.meridiem.knownByChrono,false);
    assert.equal(implied.matches[0].start.year.knownByChrono,false);
    assert.equal(known.reference.synthetic,true);assert.equal(known.usedForScoring,false);
});
test('partial ranges, ignored qualifiers, missing phrases and failed grounding remain explicit',()=>{
    const partial=interpretValidatedTime(fact('between 11 and midnight'),true);
    assert.equal(partial.status,'PARTIAL_MATCH');assert.equal(partial.matches[0].matchedText,'midnight');
    assert.match(partial.unmatchedText,/between 11/);
    assert.equal(interpretValidatedTime(fact('Around 10 at night'),true).status,'PARTIAL_MATCH');
    assert.equal(interpretValidatedTime(fact('around 8'),true).status,'NO_MATCH');
    assert.equal(interpretValidatedTime(fact(null),true).status,'MISSING_PHRASE');
    assert.equal(interpretValidatedTime(fact('11 pm'),false).status,'UNVERIFIED_SOURCE');
    assert.equal(interpretValidatedTime({...fact('11 pm'),ambiguousSource:true},true).status,'AMBIGUOUS_SOURCE');
    assert.equal(interpretValidatedTime(fact('x'.repeat(2001)),true).status,'INPUT_TOO_LONG');
});
test('pipeline runs Chrono on validated time phrases, overwrites injected parser results and leaves scoring independent',()=>{
    const a=claim('11:00 p.m.','11:00 p.m.'),b=claim('7:00 p.m.','7:00 p.m.');
    const question='Q: When did this happen on December 12th?\nA: ';
    const input={type:'DIRECT',claim1:a,claim2:b,chronoTimeAnalysis:{score:100}};
    const result=assessCandidate(input,question+a.original,question+b.original);
    assert.equal(result.chronoTimeAnalysis.claim1.matches[0].start.hour.value,23);
    const f=c=>Object.assign(new TestimonyFact(c),{context:question,sourceStatement:c.original,ambiguousSource:false});
    const expected=scoreFacts(f(a),f(b));
    for(const key of ['score','status','band','evidenceStrength','commitment','rulesFired'])assert.deepEqual(result[key],expected[key]);
    assert.equal(result.claim1.timePhrase,a.timePhrase);
    const invalid=assessCandidate(input,'A: Different testimony',question+b.original);
    assert.equal(invalid.chronoTimeAnalysis.claim1.status,'UNVERIFIED_SOURCE');assert.equal(invalid.score,null);
    assert.deepEqual(invalid.chronoTimeAnalysis.claim1.matches,[]);
});
test('Chrono summary logs have no literal transcript or phrase content',()=>{
    const diagnostic=interpretValidatedTime(fact('11:00 p.m.'),true);
    const summary=summarizeChronoTime({claim1:diagnostic});
    assert.equal(summary[0].matches,1);assert.ok(!JSON.stringify(summary).includes('11:00'));
});
