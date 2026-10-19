import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveType,quoteFound,compareValues} from '../../server/typeDecision.js';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
import {directWireSchema} from '../../server/directOutput.js';

const d=(over={})=>({sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'NONE',value1:'',value2:'',missingFact:'',...over});
const texts=["Q: Did you sign on Monday?\nA: I don't remember signing anything that day. I left around 8 PM. We had three or four cars.",
 'Q: Did you sign?\nA: I signed the lease at noon on Tuesday. I left at 11 PM. I left at 8:15 PM. We had 9 cars.'];

test('each decision pattern always maps to one of the three types, the same way every time',()=>{
 const table=[
  [d({sameSubject:'NO'}),'FALSE_POSITIVE'],
  [d({sameCircumstances:'DIFFERENT_STATED',circumstancesQuote:'on Monday',conflictForm:'AFFIRM_VS_DENY'}),'FALSE_POSITIVE'],
  [d({canBothBeTrue:'YES',reconciliation:'UNCERTAIN_RECOLLECTION',reconciliationQuote:"I don't remember signing"}),'FALSE_POSITIVE'],
  [d({conflictForm:'AFFIRM_VS_DENY'}),'DIRECT'],
  [d({conflictForm:'EXHAUSTIVE_VS_EXCEPTION'}),'DIRECT'],
  [d({conflictForm:'DIFFERENT_EXACT_VALUES'}),'DIRECT'],
  [d({conflictForm:'REQUIRES_INFERENCE'}),'INFERENTIAL'],
  [d({canBothBeTrue:'NO'}),'INFERENTIAL'],
  [d({canBothBeTrue:'YES'}),'FALSE_POSITIVE'],
  [d({sameSubject:'UNCLEAR',missingFact:'Which lease "it" refers to.',conflictForm:'AFFIRM_VS_DENY'}),'DIRECT'],
 ];
 for(const [decision,type] of table)for(let i=0;i<3;i++)assert.equal(deriveType(decision,texts).type,type,JSON.stringify(decision));
});
test('missing facts become a review note, never a fourth label',()=>{
 const r=deriveType(d({sameSubject:'UNCLEAR',missingFact:'Which lease is meant.',conflictForm:'AFFIRM_VS_DENY'}),texts);
 assert.equal(r.type,'DIRECT');assert.equal(r.reviewNote,'Which lease is meant.');
 assert.equal(deriveType(d({conflictForm:'AFFIRM_VS_DENY'}),texts).reviewNote,null);
});
test('stated differences and reconciliations count only when their words are in the record',()=>{
 assert.ok(quoteFound("I DON’T remember  signing",texts));assert.ok(!quoteFound('',texts));
 const unstated=deriveType(d({sameCircumstances:'DIFFERENT_STATED',circumstancesQuote:'on a different day',conflictForm:'AFFIRM_VS_DENY'}),texts);
 assert.equal(unstated.type,'DIRECT');
 const invented=deriveType(d({canBothBeTrue:'YES',reconciliation:'CORRECTION_OR_QUALIFICATION',reconciliationQuote:'I corrected that',conflictForm:'AFFIRM_VS_DENY'}),texts);
 assert.equal(invented.type,'DIRECT');assert.equal(invented.reconciliationVerified,false);
});
test('code, not the model, settles time and quantity clashes',()=>{
 assert.deepEqual(compareValues('8 PM','11 PM'),{kind:'time',overlap:false,exact:true,farApart:true});
 assert.equal(compareValues('around 8 PM','8:15 PM').overlap,true);
 assert.equal(compareValues('three or four cars','9 dollars'),null,'different units are not compared');
 assert.deepEqual(compareValues('three or four cars','9 cars'),{kind:'quantity',overlap:false,exact:false,farApart:true});
 const v=(value1,value2,conflictForm='DIFFERENT_EXACT_VALUES')=>deriveType(d({conflictForm,value1,value2}),texts);
 assert.equal(v('around 8 PM','8:15 PM').type,'FALSE_POSITIVE','overlapping approximations are compatible even if the AI called them a clash');
 // Owner decision (Oct 2026): approximate values far apart (1.5x, or 2+ hours) are DIRECT; near misses stay INFERENTIAL.
 assert.equal(v('around 8 PM','11 PM','NON_OVERLAPPING_APPROXIMATIONS').type,'DIRECT');
 assert.equal(v('8:15 PM','11 PM').type,'DIRECT');
 assert.equal(v('8 PM','11 PM').type,'DIRECT','value missing from the record falls back to the stated form');
 assert.equal(v('three or four','9').type,'DIRECT');
 const near=['A: I left around 8 PM. We had about 40 cars. It cost tens of millions of dollars.','A: I left at 9:30 PM. We had 52 cars. It was maybe $10 billion.'];
 const w=(value1,value2)=>deriveType(d({conflictForm:'NON_OVERLAPPING_APPROXIMATIONS',value1,value2}),near);
 assert.equal(w('around 8 PM','9:30 PM').type,'INFERENTIAL','90 minutes apart is a near miss');
 assert.equal(w('about 40','52').type,'INFERENTIAL','1.3x apart is a near miss');
 assert.equal(w('tens of millions of dollars','maybe $10 billion').type,'DIRECT','dollar units match and the gap is huge');
});
test('older saved decisions with one sameFact question still map',()=>{
 assert.equal(deriveType({sameFact:'YES',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',missingFact:''},texts).type,'DIRECT');
 assert.equal(deriveType({sameFact:'NO',canBothBeTrue:'YES',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'NONE',missingFact:''},texts).type,'FALSE_POSITIVE');
});
test('the method asks the questions before the label',()=>{
 const direct=directWireSchema.properties.contradictions.items;
 assert.ok(direct.required.includes('decision'));
 const order=Object.keys(direct.properties);assert.ok(order.indexOf('decision')<order.indexOf('type'));
});
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
test('old method: code type replaces the model label, which is kept for audit; notes flag review',()=>{
 const a='I signed the form.',b='I did not sign the form.';
 const r=assessCandidate({type:'FALSE_POSITIVE',decision:d({conflictForm:'AFFIRM_VS_DENY',missingFact:'Which form is meant.'}),reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign?\nA: ${a}`,`Q: Did you sign?\nA: ${b}`);
 assert.equal(r.type,'DIRECT');assert.equal(r.modelType,'FALSE_POSITIVE');assert.match(r.typeRule,/affirm vs deny/);
 assert.equal(r.flag,'REVIEW');assert.ok(r.reasons.some(x=>/Which form is meant/.test(x)));
 const legacy=assessCandidate({type:'INFERENTIAL',reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign?\nA: ${a}`,`Q: Did you sign?\nA: ${b}`);
 assert.equal(legacy.type,'INFERENTIAL');assert.equal(legacy.modelType,undefined);
});
