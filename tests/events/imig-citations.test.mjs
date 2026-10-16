import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {buildEventExtractionPlan} from '../../server/events/extract.js';
import {materializeExtraction} from '../../server/events/extractionProtocol.js';
import {withReadingDiagnostics,citationFailureDetails,friendlyFailure} from '../../src/lib/analysisStatus.js';
import {buildReviewReport} from '../../src/lib/reviewReport.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/imig-citation-regression.json',import.meta.url),'utf8'));
const inputs=fixture.inputs.map((d,i)=>({...d,documentId:`transcript-${i+1}`,speakerRoles:fixture.speakerRoles[i]}));
const body={phase:'extract',sameWitnessConfirmed:true,transcript1:inputs[0].text,transcript2:inputs[1].text,documents:inputs,speakerRoles:fixture.speakerRoles};
const message=response=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:100}});
const plan=()=>buildEventExtractionPlan(inputs);

test('exact PDF text retains introductions, omitted-passage marker, footer, pages and reviewed Q/A roles',()=>{
 const p=plan();assert.equal(p.requestCount,2);
 for(const [i,d] of inputs.entries()){
  assert.equal(d.text.length,d.extraction.textLength);assert.equal(d.extraction.pageCount,1);
  assert.deepEqual(d.extraction.ocrPages,[]);assert.deepEqual(d.extraction.failedPages,[]);
  assert.match(d.text,/Excerpt only/);assert.match(d.text,/Source: Plaintiff-Appellant/);
  const index=parseTestimonySource(d.text,{speakerRoles:d.speakerRoles,pages:d.extraction.pages});
  assert.equal(index.turns[0].role,'UNATTRIBUTED');
  assert.equal(index.turns.filter(t=>t.role==='WITNESS').length,i===0?1:3);
  assert.ok(!index.diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'));
  const footer=index.turns.find(t=>t.speaker==='Source');assert.equal(footer.role,'OTHER');
  for(const t of index.turns.filter(t=>t.role==='WITNESS')){
   assert.ok(t.question);assert.ok(t.end<=footer.start);
   assert.ok(!d.text.slice(t.contentStart,t.end).includes('Plaintiff-Appellant'));
  }
  const ranges=p.tasks.filter(t=>t.documentIndex===i);let cursor=0;
  for(const t of ranges){assert.equal(t.coreStart,cursor);cursor=t.coreEnd;}
  assert.equal(cursor,d.text.length);
 }
 assert.match(inputs[1].text,/\* \* \*/);
});

test('unchanged saved model response is rejected for examiner-only qualifier, not PDF/offset/role damage',()=>{
 const p=plan(),task=p.tasks.find(t=>t.documentIndex===0);
 const checked=materializeExtraction(fixture.savedResponse,task,p.documents[0]);
 assert.equal(checked.events.length,0);assert.equal(checked.rejected.length,1);
 assert.deepEqual(checked.rejected[0].errors.map(e=>e.code),['QUALIFIER_NOT_LITERAL']);
 assert.equal(checked.rejected[0].materialized.sources[0].quote,'No.');
 assert.equal(checked.rejected[0].materialized.sources[1].role,'QUESTION');
 for(const s of checked.rejected[0].materialized.sources){
  assert.equal(inputs[0].text.slice(s.start,s.end),s.quote);
  assert.deepEqual(s.pageRefs,[{pdfPage:1,pageLabel:'1'}]);
 }
 assert.ok(checked.issues.some(i=>i.code==='UNSUPPORTED_UNIT_EVENT'));
 assert.deepEqual(fixture.savedResponse.events[0].qualifiers[0].phrase,'that you believe');
 assert.ok(!inputs[0].text.slice(457,461).includes('that you believe'));
});

test('workflow preserves rejected record, exact validation code and missing answer status without comparison',async()=>{
 const prepared=await prepareEventWorkflow(body);let calls=0;
 const result=await executeEventWorkflow({prepared,body,maxNewRequests:1,callModel:async()=>{calls++;return message(fixture.savedResponse);}});
 assert.equal(calls,1);assert.notEqual(result.analysis.status,'awaiting_comparison');
 assert.equal(result.contradictions.length,0);
 const task=result.analysis.tasks[0];assert.equal(task.acceptedFindings,0);assert.match(task.error,/QUALIFIER_NOT_LITERAL/);
 assert.match(task.rejectedFindings[0].reason,/QUALIFIER_NOT_LITERAL/);
 assert.equal(task.rejectedFindings[0].diagnostics[0].path,'/events/0/qualifiers/0');
 assert.match(friendlyFailure(task.rejectedFindings[0].reason),/Question wording/);
 assert.ok(citationFailureDetails(task).some(d=>d.code==='QUALIFIER_NOT_LITERAL'));
 assert.ok(result.analysis.eventState.extraction.tasks[0].rawText.includes('that you believe'));
 await assert.rejects(()=>prepareEventWorkflow({...body,phase:'compare',eventState:result.analysis.eventState}),/Finish complete event extraction/);
 // Old saved UI projections omitted details, but the full audit already held them.
 const legacy={id:task.id,status:'partial',rejectedFindings:[{candidateIndex:0,reason:'Event or comparison failed source/schema validation.'}]};
 const displayed=withReadingDiagnostics(result.analysis,legacy);
 assert.equal(displayed.acceptedFindings,0);
 assert.ok(citationFailureDetails(displayed).some(d=>d.code==='QUALIFIER_NOT_LITERAL'));
 const html=buildReviewReport({draft:{texts:inputs.map(i=>i.text),results:[],analysis:{...result.analysis,tasks:[legacy]}}});
 assert.match(html,/QUALIFIER_NOT_LITERAL/);assert.match(html,/fresh reading attempt needs cost approval/);
});

// A separate scripted valid transport tests the existing contract; it does not
// auto-repair the saved response and does not measure live model compliance.
function validMock(input){
 const answers=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);
 return {schemaVersion:1,events:answers.map((s,i)=>{
  const q=input.sources.find(t=>t.id===s.questionUnitId);
  return {id:`mock-${i}`,kind:'witness_answer',summary:'Scripted extraction contract check; no classification expectation.',
   assertion:{polarity:s.text.trim()==='No.'?'DENIED':'AFFIRMED',sourceIds:['a']},
   attributes:[{name:'question_context',state:'STATED',basis:'QUESTION_CONTEXT',value:q.text.trim(),sourceIds:['q']}],
   qualifiers:[],relations:[],sources:[{id:'a',unitId:s.id,quote:s.text.trim(),occurrence:0},{id:'q',unitId:q.id,quote:q.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]};
 }),units:answers.map((s,i)=>({unitId:s.id,status:'EVENTS',eventIds:[`mock-${i}`],reason:null}))};
}
test('valid scripted extraction of both full excerpts accounts for all four answers with original offsets',async()=>{
 const prepared=await prepareEventWorkflow(body);
 const result=await executeEventWorkflow({prepared,body,callModel:async params=>message(validMock(JSON.parse(params.messages[0].content)))});
 assert.equal(result.analysis.status,'awaiting_comparison');assert.equal(result.contradictions.length,0);
 const docs=result.analysis.eventState.extraction.documents;
 assert.deepEqual(docs.map(d=>d.events.length),[1,3]);
 for(const [i,d] of docs.entries()){
  assert.equal(d.coverage.status,'COMPLETE');assert.equal(d.recordValidation.valid,true);
  for(const event of d.events)for(const s of event.sources)assert.equal(inputs[i].text.slice(s.start,s.end),s.quote);
 }
 assert.ok(result.analysis.tasks.every(t=>t.rejectedFindings.length===0));
});

test('qualifier instructions are generic and preserve witness-only validation',()=>{
 const p=plan();assert.match(p.system,/Qualifier provenance is WITNESS ONLY/);
 assert.match(p.system,/examiner's QUESTION is not a witness qualifier/);
 assert.ok(!p.system.includes('Imig'));assert.ok(!p.system.includes('stopping distance'));
});
