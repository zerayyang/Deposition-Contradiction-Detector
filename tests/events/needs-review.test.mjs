import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan,executeEventExtraction} from '../../server/events/extract.js';
import {buildEventComparisonPlan,previewEventComparisonPlan,executeEventComparison} from '../../server/events/compare.js';
import {scoreEventComparisons} from '../../server/events/scoringAdapter.js';

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

// A possible conflict that needs a missing fact is its own outcome: it always reaches a
// person, names what is missing, and never receives a numeric score.
test('NEEDS_REVIEW comparisons are accepted, flagged for review and never scored',async()=>{
 const data=fixture(),plan=planFor(data);
 const result=await run(plan,input=>related(input,{type:'NEEDS_REVIEW',missingContext:['Which occasion the second answer describes.']}));
 assert.equal(result.status,'COMPLETE');
 assert.ok(result.comparisons.every(c=>c.type==='NEEDS_REVIEW'&&c.reviewRequired));
 const cards=scoreEventComparisons(result,data.extractionPlan);
 assert.ok(cards.length>0);
 for(const card of cards){
  assert.equal(card.type,'NEEDS_REVIEW');assert.equal(card.humanConfidence,null);assert.equal(card.status,'NOT_EVALUABLE');
  assert.equal(card.notEvaluableReason,'NEEDS_REVIEW');assert.match(card.reasons[0],/Which occasion/);
 }
});
test('the wire schema rejects labels outside the four outcomes',async()=>{
 const result=await run(planFor(),input=>related(input,{type:'MAYBE'}));
 assert.notEqual(result.status,'COMPLETE');
});
