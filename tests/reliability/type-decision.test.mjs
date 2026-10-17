import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan,executeEventExtraction} from '../../server/events/extract.js';
import {buildEventComparisonPlan,previewEventComparisonPlan,executeEventComparison} from '../../server/events/compare.js';
import {scoreEventComparisons} from '../../server/events/scoringAdapter.js';
import {deriveType,quoteFound,compareValues} from '../../server/typeDecision.js';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
import {directWireSchema} from '../../server/directOutput.js';
import {comparisonWireSchema} from '../../server/events/comparisonProtocol.js';

const hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(left=['I signed the form.','I drove the van.'],right=['I drove the car.','I did not sign the form.']){
 const sources=[left,right].map((sentences,i)=>({documentId:`fictional-${i}`,text:sentences.map((s,n)=>`Q: Tell me about item ${n}.\nA: ${s}`).join('\n\n')}));
 const extractionPlan=buildEventExtractionPlan(sources);
 const documents=sources.map((source,i)=>({documentId:source.documentId,documentSha256:hash(source.text),events:[left,right][i].map((quote,n)=>({
  id:`e${n}`,kind:`open_kind_${n}`,summary:`Proposed record ${n}`,assertion:{polarity:'AFFIRMED',sourceIds:[`s${n}`]},attributes:[{name:'literal_statement',state:'STATED',value:quote,basis:'WITNESS_WORDS',sourceIds:[`s${n}`]}],qualifiers:[],relations:[],
  sources:[{id:`s${n}`,role:'WITNESS',quote,start:source.text.indexOf(quote,source.text.indexOf(`Q: Tell me about item ${n}.`)),end:source.text.indexOf(quote,source.text.indexOf(`Q: Tell me about item ${n}.`))+quote.length,pageRefs:[]}],reviewRequired:false,unresolvedReasons:[]
 })),coverage:{status:'COMPLETE',segments:[{start:0,end:source.text.length,status:'PROCESSED',eventIds:[left,right][i].map((_,n)=>`e${n}`),reason:null}]}}));
 return {extractionPlan,extractionResult:{planId:extractionPlan.id,status:'COMPLETE',documents}};
}
const planFor=(data=fixture(),options={})=>buildEventComparisonPlan(data,{sameWitnessConfirmed:true,...options});
const approval=plan=>({planId:plan.id,requestCount:plan.requestCount,maxUsd:plan.cost.conservativeBudget});
const message=(response,extra={})=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:50},...extra});
const unrelated=input=>({schemaVersion:1,rows:input.left.records.map(left=>({leftId:left.id,pairs:[],unrelatedRanges:[{start:0,end:input.right.records.length,reason:'Mock declaration of distinct facts; not measured semantic correctness.'}]}))});
function comparison(left,right,extra={}){return {issue:'Proposed independent factual issue',type:'DIRECT',report:true,reasoning:'Scripted test explanation, not an observed model judgment.',leftSourceIds:[left.event.sources[0].id],rightSourceIds:[right.event.sources[0].id],missingContext:[],...extra};}
const related=(input,extras={})=>({schemaVersion:1,rows:input.left.records.map(left=>({leftId:left.id,pairs:input.right.records.map(right=>({rightId:right.id,relation:'RELATED',reason:'Mock shared-fact relationship.',comparisons:[comparison(left,right,extras)]})),unrelatedRanges:[]}))});
const run=(plan,reply=related,extra={})=>executeEventComparison({plan,approval:approval(plan),callModel:async params=>message(reply(JSON.parse(params.messages[0].content)),extra)});


// Fictional decisions only. The AI answers small questions; fixed rules pick the type.
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
 assert.deepEqual(compareValues('8 PM','11 PM'),{kind:'time',overlap:false,exact:true});
 assert.equal(compareValues('around 8 PM','8:15 PM').overlap,true);
 assert.equal(compareValues('three or four cars','9 dollars'),null,'different units are not compared');
 assert.deepEqual(compareValues('three or four cars','9 cars'),{kind:'quantity',overlap:false,exact:false});
 const v=(value1,value2,conflictForm='DIFFERENT_EXACT_VALUES')=>deriveType(d({conflictForm,value1,value2}),texts);
 assert.equal(v('around 8 PM','8:15 PM').type,'FALSE_POSITIVE','overlapping approximations are compatible even if the AI called them a clash');
 assert.equal(v('around 8 PM','11 PM','NON_OVERLAPPING_APPROXIMATIONS').type,'INFERENTIAL');
 assert.equal(v('8:15 PM','11 PM').type,'DIRECT');
 assert.equal(v('8 PM','11 PM').type,'DIRECT','value missing from the record falls back to the stated form');
 assert.equal(v('three or four','9').type,'INFERENTIAL');
});
test('older saved decisions with one sameFact question still map',()=>{
 assert.equal(deriveType({sameFact:'YES',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',missingFact:''},texts).type,'DIRECT');
 assert.equal(deriveType({sameFact:'NO',canBothBeTrue:'YES',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'NONE',missingFact:''},texts).type,'FALSE_POSITIVE');
});
test('both methods ask the questions before the label',()=>{
 const direct=directWireSchema.properties.contradictions.items;
 assert.ok(direct.required.includes('decision'));
 const order=Object.keys(direct.properties);assert.ok(order.indexOf('decision')<order.indexOf('type'));
 const issue=comparisonWireSchema.properties.rows.items.properties.pairs.items.properties.comparisons.items;
 assert.ok(issue.required.includes('decision'));
 const keys=Object.keys(issue.properties);assert.ok(keys.indexOf('decision')<keys.indexOf('type'));
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
test('new method: code type replaces the model label inside comparison validation',async()=>{
 const result=await run(planFor(),input=>related(input,{type:'FALSE_POSITIVE',decision:d({conflictForm:'AFFIRM_VS_DENY'})}));
 assert.ok(result.comparisons.length>0);
 for(const c of result.comparisons){assert.equal(c.type,'DIRECT');assert.ok(c.variants.every(v=>v.modelType==='FALSE_POSITIVE'));}
 const noted=await run(planFor(),input=>related(input,{type:'DIRECT',decision:d({sameSubject:'UNCLEAR',missingFact:'Which form is meant.',conflictForm:'AFFIRM_VS_DENY'})}));
 assert.ok(noted.comparisons.every(c=>c.type==='DIRECT'&&c.reviewRequired&&c.variants.every(v=>v.reviewReasons.includes('Which form is meant.'))));
});
