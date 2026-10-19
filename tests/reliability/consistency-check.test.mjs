import test from 'node:test';
import assert from 'node:assert/strict';
import {borderlineIndexes,applyRecheck,runRecheck,buildRecheckRequest,estimateRecheckCost,MAX_RECHECK_PAIRS} from '../../server/consistencyCheck.js';

// Fictional findings and a fake model; no network.
const d=(over={})=>({sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',value1:'',value2:'',missingFact:'',...over});
const texts=['Q: Did you sign?\nA: I signed the lease.','Q: Did you sign?\nA: I never signed the lease.'];
const f=(over={})=>({type:'DIRECT',modelType:'DIRECT',decision:d(),claim1:{original:'I signed the lease.'},claim2:{original:'I never signed the lease.'},humanConfidence:76,...over});
const reply=checks=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({checks})}],usage:{input_tokens:900,output_tokens:200}});

test('only borderline findings are re-checked',()=>{
 const findings=[f(),f({type:'INFERENTIAL',decision:d({conflictForm:'REQUIRES_INFERENCE'})}),f({modelType:'FALSE_POSITIVE'}),f({reviewNote:'Which lease.'}),f({reconciliationVerified:false}),f({type:'FALSE_POSITIVE',modelType:'FALSE_POSITIVE',decision:d({canBothBeTrue:'YES'})}),{type:'DIRECT'}];
 assert.deepEqual(borderlineIndexes(findings),[1,2,3,4]);
 assert.equal(borderlineIndexes(Array.from({length:30},()=>f({reviewNote:'x'}))).length,MAX_RECHECK_PAIRS);
});
test('agreement confirms the label; disagreement marks Uncertain with no score',()=>{
 const findings=[f({reviewNote:'x'}),f({reviewNote:'y'})];
 const out=applyRecheck(findings,[{id:'0',decision:d(),reasoning:'Same.'},{id:'1',decision:d({canBothBeTrue:'YES',reconciliation:'UNCERTAIN_RECOLLECTION',reconciliationQuote:'I signed the lease'}),reasoning:'Compatible.'}],texts);
 assert.equal(out[0].consistency.agreed,true);assert.equal(out[0].humanConfidence,76);
 assert.equal(out[1].labelDisagreement,true);assert.deepEqual(out[1].typeAlternatives,['DIRECT','FALSE_POSITIVE']);assert.equal(out[1].humanConfidence,null);assert.equal(out[1].consistency.agreed,false);
});
test('one request covers all borderline pairs, and nothing borderline means no request',async()=>{
 let calls=0,sent;
 const callModel=async params=>{calls++;sent=params;return reply([{id:'0',decision:d({conflictForm:'REQUIRES_INFERENCE'}),reasoning:'x'}]);};
 const r=await runRecheck({findings:[f({reviewNote:'x'}),f()],texts,callModel});
 assert.equal(calls,1);assert.equal(r.checked,1);assert.equal(r.disagreements,1);assert.match(sent.messages[0].content,/"id":"0"/);assert.doesNotMatch(sent.messages[0].content,/"id":"1"/);
 assert.doesNotMatch(sent.messages[0].content,/DIRECT/,'the first label is not shown to the second read');
 const none=await runRecheck({findings:[f()],texts,callModel:async()=>{throw new Error('must not call');}});
 assert.equal(none.checked,0);
});
test('the request and cost estimate are bounded',()=>{
 const req=buildRecheckRequest([f({reviewNote:'x'})],texts);assert.equal(req.max_tokens,8000);
 const est=estimateRecheckCost([f({reviewNote:'x'})],texts);assert.equal(est.pairs,1);assert.ok(est.upperBound>0&&est.upperBound<0.5);
 assert.deepEqual(estimateRecheckCost([f()],texts),{pairs:0,estimated:0,upperBound:0});
});
test('dismissals resting on "correction" or "added detail" are double-checked; firmer ones are not',()=>{
 const fp=(reconciliation,verified=true)=>({type:'FALSE_POSITIVE',modelType:'FALSE_POSITIVE',reconciliationVerified:verified,decision:{reconciliation}});
 assert.deepEqual(borderlineIndexes([fp('CORRECTION_OR_QUALIFICATION'),fp('ADDED_DETAIL'),fp('UNCERTAIN_RECOLLECTION'),fp('OVERLAPPING_APPROXIMATIONS'),fp('NONE',null)]),[0,1]);
});
