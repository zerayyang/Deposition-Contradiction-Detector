import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan,executeEventExtraction} from '../../server/events/extract.js';
import {buildEventComparisonPlan,previewEventComparisonPlan,executeEventComparison} from '../../server/events/compare.js';
import {parseComparisonMessage,validateComparisonResponse} from '../../server/events/comparisonProtocol.js';

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

// Step-by-step (hosted) execution: a saved partial comparison is kept and skipped,
// never automatically re-paid, and the next untouched task still runs.
test('a retained partial comparison is skipped and the next approved task runs',async()=>{
 const plan=planFor(fixture(),{eventsPerBlock:1});assert.equal(plan.requestCount,4);
 const first=[],second=[];
 const bad=input=>({schemaVersion:1,rows:input.left.records.map(left=>({leftId:left.id,pairs:input.right.records.map(right=>({rightId:right.id,relation:'RELATED',reason:'Mock.',comparisons:[comparison(left,right,{leftSourceIds:['missing-source']})]})),unrelatedRanges:[]}))});
 const step1=await executeEventComparison({plan,approval:approval(plan),maxNewRequests:1,callModel:async params=>{first.push(params.messages[0].content);return message(bad(JSON.parse(params.messages[0].content)));}});
 assert.equal(first.length,1);
 const saved=step1.tasks.find(t=>t.status==='PARTIAL');assert.ok(saved,'first task is partial');
 const retainedTasks=new Map(step1.tasks.filter(t=>['PARTIAL','FAILED'].includes(t.status)).map(t=>[t.inputSha256,t]));
 const step2=await executeEventComparison({plan,approval:approval(plan),maxNewRequests:1,retainedTasks,callModel:async params=>{second.push(params.messages[0].content);return message(related(JSON.parse(params.messages[0].content)));}});
 assert.equal(second.length,1);assert.notEqual(second[0],first[0],'the partial task was not paid for again');
 const again=step2.tasks.find(t=>t.inputSha256===saved.inputSha256);assert.equal(again.status,'PARTIAL');assert.equal(again.reused,true);
 assert.equal(step2.tasks.filter(t=>t.status==='COMPLETE').length,1);
 assert.equal(step2.tasks.filter(t=>t.status==='NOT_ATTEMPTED').length,2);
});
