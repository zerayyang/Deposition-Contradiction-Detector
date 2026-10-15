import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCandidate } from '../humanConfidencePipeline.js';

const question='Q: Did you go inside the store on the night of June 18th?\nA: ';
const claim=(original,activityPhrase)=>({original,activityPhrase,timePhrase:null,locationPhrase:null,
    personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
function assess(a,b,{type='DIRECT',question1=question,question2=question}={}) {
    return assessCandidate({type,severity:'HIGH',reasoning:'Regression fixture',claim1:a,claim2:b},
        question1+a.original,question2+b.original);
}
const activityRule=r=>r.rulesFired.find(x=>x.id==='activity polarity');

test('movement denial conflicts with an affirmative purpose clause across short/long extracted phrases',()=>{
    const a="I didn't go inside. I stayed in the car.";
    const b='I went inside to buy cigarettes that night.';
    const scores=[];
    for(const left of ["I didn't go inside","didn't go inside"]) {
        for(const right of ['went inside','went inside to buy cigarettes','I went inside to buy cigarettes']) {
            const result=assess(claim(a,left),claim(b,right));
            assert.equal(result.status,'CONFLICT_SUPPORTED',`${left} / ${right}`);
            assert.equal(activityRule(result)?.verdict,'CONFLICT');
            scores.push(result.score);
        }
    }
    assert.equal(new Set(scores).size,1,'Extraction length must not change the score for this evidence');
});
test('movement implication is symmetric and does not use Claude opinions',()=>{
    const a=claim("I didn't go outside.","didn't go outside");
    const b=claim('I went outside to get help.','went outside to get help');
    const scores=[];
    for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE'])for(const [first,second] of [[a,b],[b,a]]) {
        const result=assess(first,second,{type});
        assert.equal(activityRule(result)?.verdict,'CONFLICT');scores.push(result.score);
    }
    assert.equal(new Set(scores).size,1);
});
test('purpose-limited denial does not deny movement, and different purposes do not prove compatibility',()=>{
    for(const [a,b] of [
        ["I didn't go inside to buy cigarettes.",'I went inside to get help.'],
        ["I didn't go inside to buy cigarettes.",'I went inside.'],
        ['I went inside to buy cigarettes.','I went inside to get help.']
    ])assert.equal(activityRule(assess(claim(a,a),claim(b,b))),undefined);
});
test('different directions, destinations, conditions, and exceptions cannot activate the new implication',()=>{
    for(const [a,b] of [
        ["I didn't go outside.",'I went inside to get help.'],
        ["I didn't go inside the store.",'I went inside the office to get help.'],
        ["I didn't go inside.",'If I went inside to get help, I would call.'],
        ["I didn't go inside except to get help.",'I went inside to get help.'],
        ["I didn't go inside.",'I went inside to get help only if the door was open.']
    ])assert.equal(activityRule(assess(claim(a,a),claim(b,b))),undefined,`${a} / ${b}`);
});
test('movement comparisons still require aligned source events',()=>{
    const a=claim("I didn't go inside.","didn't go inside");
    const b=claim('I went inside to get help.','went inside to get help');
    assert.equal(activityRule(assess(a,b,{question2:'Q: Did you go inside on June 19th?\nA: '})),undefined);
    assert.equal(activityRule(assess(a,b,{question1:'',question2:''})),undefined);
});
test('cropped quotes cannot hide source negation, denial, purpose restriction or another person',()=>{
    const negative=claim("I didn't go inside.","didn't go inside");
    for(const [source,extracted] of [
        ["I didn't go inside to get help.",'go inside to get help'],
        ["I never said I went inside to get help.",'went inside to get help'],
        ['Tom went inside to get help.','went inside to get help'],
        ['I went inside to get help, but only if someone called.','went inside to get help']
    ]) {
        const c=claim(extracted,extracted);
        const r=assessCandidate({type:'DIRECT',claim1:negative,claim2:c},question+negative.original,question+source);
        assert.equal(activityRule(r),undefined,source);
    }
});

test('short matching extractions cannot hide a purpose-limited denial',()=>{
    const source="I didn't go inside to buy cigarettes.";
    const first=claim("didn't go inside","didn't go inside"),second=claim('I went inside.','went inside');
    const r=assessCandidate({type:'DIRECT',claim1:first,claim2:second},question+source,question+second.original);
    assert.equal(activityRule(r),undefined);
});
test('spelled-out negation and a source assertion hedge retain movement scope',()=>{
    const a=claim('I did not go inside.','did not go inside');
    const b=claim('I think I went inside to get help.','went inside to get help');
    assert.equal(activityRule(assess(a,b))?.verdict,'CONFLICT');
});

test('cropping an assertion hedge cannot inflate the movement score',()=>{
    const a=claim("I didn't go inside.","didn't go inside");
    const source='I think I went inside to get help.';
    const make=c=>assessCandidate({type:'DIRECT',claim1:a,claim2:c},question+a.original,question+source);
    const full=make(claim(source,'went inside to get help'));
    const cropped=make(claim('went inside to get help','went inside to get help'));
    assert.equal(cropped.score,full.score);
    assert.ok(cropped.languageDetails.claim2.applied.some(x=>x.phrase==='I think'&&x.effect<0));
    assert.ok(cropped.score<assess(a,claim('I went inside to get help.','went inside to get help')).score);
});
