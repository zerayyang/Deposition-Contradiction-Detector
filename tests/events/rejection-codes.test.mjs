import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {materializeExtraction} from '../../server/events/extractionProtocol.js';
import {buildEventExtractionPlan} from '../../server/events/extract.js';
import {citationMessages,citationFailureDetails,friendlyFailure,withReadingDiagnostics} from '../../src/lib/analysisStatus.js';
import {buildReviewReport} from '../../src/lib/reviewReport.js';
const text='Q: What occurred?\nA: Yes. Yes. Synthetic answer.';
const plan=buildEventExtractionPlan([{documentId:'synthetic',text}]);const task=plan.tasks[0],doc=plan.documents[0];
const unit=task.input.sources.find(s=>s.role==='WITNESS');const question=task.input.sources.find(s=>s.role==='QUESTION');
const event=()=>({id:'e',kind:'synthetic',summary:'Mock only.',assertion:{polarity:'AFFIRMED',sourceIds:['w']},attributes:[],qualifiers:[],relations:[],sources:[{id:'w',unitId:unit.id,quote:'Synthetic answer.',occurrence:0}],reviewRequired:false,unresolvedReasons:[]});
const response=e=>({schemaVersion:1,events:[e],units:[{unitId:unit.id,status:'EVENTS',eventIds:['e'],reason:null}]});
const cases=[
 ['VERBATIM_MISMATCH',e=>{e.sources[0].quote='Synthetic answer!';}],
 ['OCCURRENCE_REQUIRED',e=>{e.sources[0].quote='Yes.';e.sources[0].occurrence=null;}],
 ['OCCURRENCE_MISSING',e=>{e.sources[0].occurrence=9;}],
 ['UNAVAILABLE_SOURCE_UNIT',e=>{e.sources[0].unitId='missing';}],
 ['NO_WITNESS_QUOTE_IN_CORE',e=>{e.sources[0].unitId=question.id;e.sources[0].quote=question.text.trim();}],
 ['DUPLICATE_SOURCE_ID',e=>{e.sources.push({...e.sources[0]});}],
 ['FORBIDDEN_SCORE_ATTRIBUTE',e=>{e.attributes.push({name:'confidence',state:'UNSTATED',value:null,basis:'NONE',sourceIds:[]});}],
 ['INVALID_EVENT_SCHEMA',e=>{e.extra='forbidden';}],
];
for(const [code,mutate] of cases)test(code+' keeps strict rejection and plain-language message',()=>{
 const e=event();mutate(e);const raw=response(e),before=structuredClone(raw),result=materializeExtraction(raw,task,doc);
 assert.equal(result.events.length,0);assert.equal(result.rejected[0].errors[0].code,code);assert.deepEqual(raw,before);
 assert.ok(citationMessages[code]);assert.equal(friendlyFailure(code),citationMessages[code]);
 assert.equal(citationFailureDetails({rejectedFindings:[{diagnostics:result.rejected[0].errors}]}).some(d=>d.code===code),true);
});
test('duplicate event IDs reject every occurrence without overwriting',()=>{
 const raw=response(event());raw.events.push(event());const result=materializeExtraction(raw,task,doc);
 assert.equal(result.rejected.length,2);assert.ok(result.rejected.every(r=>r.errors[0].code==='DUPLICATE_EVENT_ID'));
 assert.equal(friendlyFailure('DUPLICATE_EVENT_ID'),citationMessages.DUPLICATE_EVENT_ID);
});
test('redacted bounded previews appear in private report only, never friendly UI projection',()=>{
 const e=event();e.sources[0].quote='DIAGNOSTIC_ONLY person@example.test 5551234567 '+('x'.repeat(90));
 const raw=response(e),result=materializeExtraction(raw,task,doc),diagnostic=result.rejected[0].reportDiagnostic;
 assert.ok(diagnostic.modelQuote.length<=60&&diagnostic.nearestSource.length<=60);
 assert.ok(!diagnostic.modelQuote.includes('person@example.test'));assert.ok(!diagnostic.modelQuote.includes('5551234567'));
 const saved={id:task.id,status:'PARTIAL',...result};
 const analysis={workflow:'events-v1',phase:'extract',status:'partial',tasks:[{id:task.id,status:'partial'}],eventState:{extraction:{tasks:[saved],documents:[]}}};
 const projected=withReadingDiagnostics(analysis,analysis.tasks[0]);
 assert.ok(!JSON.stringify(projected).includes('DIAGNOSTIC_ONLY'));assert.ok(!JSON.stringify(citationFailureDetails(projected)).includes('DIAGNOSTIC_ONLY'));
 const html=buildReviewReport({draft:{results:[],analysis}});assert.match(html,/Private citation diagnostic preview/);assert.match(html,/DIAGNOSTIC_ONLY/);
 assert.ok(!JSON.stringify(result.issues).includes('DIAGNOSTIC_ONLY'));
});
test('UI component does not render reportDiagnostic previews',()=>{
 const source=fs.readFileSync(new URL('../../src/AnalysisStatus.jsx',import.meta.url),'utf8');assert.ok(!source.includes('reportDiagnostic'));
});
