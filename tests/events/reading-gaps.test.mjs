import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {createCloudAnalysis} from '../../server/cloudAnalysis.js';
import {resumableCloudJobId} from '../../src/lib/cloudAnalysisClient.js';
const first=Array.from({length:13},(_,i)=>`Q: Synthetic question ${i+1}?\nA: Synthetic answer ${i+1}.`).join('\n');
const body={caseId:'11111111-1111-4111-8111-111111111111',workflow:'events-v1',phase:'extract',sameWitnessConfirmed:true,speakerRoles:[{},{}],transcript1:first,transcript2:'Q: Synthetic other question?\nA: Synthetic other answer.'};
const msg=response=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:100}});
function valid(input){const units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);return {schemaVersion:1,events:units.map((u,i)=>({id:'e'+i,kind:'synthetic',summary:'Mock record.',assertion:{polarity:'AFFIRMED',sourceIds:['w']},attributes:[],qualifiers:[],relations:[],sources:[{id:'w',unitId:u.id,quote:u.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),units:units.map((u,i)=>({unitId:u.id,status:'EVENTS',eventIds:['e'+i],reason:null}))};}
function transport(){let calls=0;return {get calls(){return calls;},async call(params){const n=calls++,input=JSON.parse(params.messages[0].content);if(n===1)throw new Error('Known mocked reading failure');const r=valid(input);if(n===0)r.events[0].sources[0].quote='INVALID_CITATION';return msg(r);}};}
async function extracted(){const prepared=await prepareEventWorkflow(body);assert.equal(prepared.plan.requestCount,3);const mock=transport();const result=await executeEventWorkflow({prepared,body,callModel:p=>mock.call(p)});return {result,mock};}
test('three chunks continue after partial and failed chunks, preserve notes and list exact gaps',async()=>{
 const {result,mock}=await extracted();assert.equal(mock.calls,3);
 assert.equal(result.analysis.status,'awaiting_gap_acknowledgement');assert.equal(result.analysis.readingFinished,true);
 assert.deepEqual(result.analysis.tasks.map(t=>t.status),['partial','failed','completed']);
 const extraction=result.analysis.eventState.extraction;assert.equal(extraction.status,'READING_GAPS');
 assert.equal(extraction.documents[0].coverage.status,'FAILED');assert.equal(extraction.documents[1].coverage.status,'COMPLETE');
 assert.equal(extraction.gaps.length,2);assert.ok(extraction.documents[0].events.length>0);
 assert.ok(extraction.documents[1].events.length>0);assert.ok(extraction.tasks[0].rawText.includes('INVALID_CITATION'));
 let paid=0;const resumed={...body,eventState:result.analysis.eventState};const next=await prepareEventWorkflow(resumed);
 assert.equal(next.preview.requestCount,0);assert.equal(next.preview.retainedGapRequests,2);
 const replay=await executeEventWorkflow({prepared:next,body:resumed,callModel:()=>{paid++;throw new Error('No retry allowed');}});
 assert.equal(paid,0);assert.equal(replay.analysis.gapDigest,result.analysis.gapDigest);
});
test('comparison is blocked until acknowledgement matches the exact replayed gap digest',async()=>{
 const {result}=await extracted();const request={...body,phase:'compare',eventState:result.analysis.eventState};
 await assert.rejects(()=>prepareEventWorkflow(request),/Acknowledge the listed reading gaps/);
 await assert.rejects(()=>prepareEventWorkflow({...request,acknowledgeExtractionGaps:true,extractionGapDigest:'stale'}),/Acknowledge/);
 const prepared=await prepareEventWorkflow({...request,acknowledgeExtractionGaps:true,extractionGapDigest:result.analysis.gapDigest});
 assert.equal(prepared.preview.upstreamIncomplete,true);assert.ok(prepared.preview.requestCount>0);
});
test('valid UNRESOLVED and NO_EVENT are processed dispositions, not chunk failures',async()=>{
 const small={...body,transcript1:'Q: Synthetic question?\nA: Synthetic uncertain answer.',transcript2:'Q: Another question?\nA: Synthetic non-event answer.'};
 const prepared=await prepareEventWorkflow(small);let calls=0;
 const result=await executeEventWorkflow({prepared,body:small,callModel:async p=>{const input=JSON.parse(p.messages[0].content),units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);const status=calls++===0?'UNRESOLVED':'NO_EVENT';return msg({schemaVersion:1,events:[],units:units.map(u=>({unitId:u.id,status,eventIds:[],reason:'Synthetic disposition reason.'}))});}});
 assert.ok(result.analysis.tasks.every(t=>t.status==='completed'));
 assert.equal(result.analysis.gaps.length,1);assert.equal(result.analysis.gaps[0].code,'UNIT_UNRESOLVED');
 assert.equal(result.analysis.eventState.extraction.documents[1].coverage.status,'COMPLETE');
});
const response=()=>({code:200,status(code){this.code=code;return this;},json(value){this.value=value;return this;}});
const jobId='22222222-2222-4222-8222-222222222222';
function cloud(){const objects=new Map(),mock=transport();const store={authorize:async()=>{},get:async(c,j,n)=>objects.get(c+'/'+j+'/'+n)??null,put:async(c,j,n,v)=>{const k=c+'/'+j+'/'+n;if(objects.has(k))return false;objects.set(k,structuredClone(v));return true;}};return {mock,make:()=>createCloudAnalysis({instructions:'Synthetic mock.',codeFingerprint:'fixture',storeForRequest:()=>store,callModel:p=>mock.call(p)})};}
const req=b=>({body:b??{},params:{caseId:body.caseId,jobId},identity:{id:'synthetic-owner'}});
test('server finality and client resume agree through three fresh hosted instances without retrying failed chunks',async()=>{
 const s=cloud();let api=s.make(),preview=response();await api.preview(req(body),preview);assert.equal(preview.code,200);assert.equal(preview.value.requestCount,3);
 const start=response();await api.start(req({...body,approvedPlanId:preview.value.id,approvedRequestCount:3,approvedMaxUsd:preview.value.cost.conservativeBudget}),start);assert.equal(start.code,200);
 for(let i=0;i<3;i++){
  api=s.make();const step=response();await api.step(req(),step);assert.equal(step.code,200,JSON.stringify(step.value));assert.equal(s.mock.calls,i+1);
  assert.equal(step.value.done,i===2);
  assert.equal(resumableCloudJobId(step.value.result.analysis),i===2?null:jobId);
 }
 const repeat=response();await s.make().step(req(),repeat);assert.equal(s.mock.calls,3);assert.equal(repeat.value.done,true);
});
test('reading-gap controls render acknowledgement and never expose private diagnostic previews',async()=>{
 const {result}=await extracted(),{transformWithOxc}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const url=new URL('../../src/EventReview.jsx',import.meta.url),source=await fs.readFile(url,'utf8'),transformed=await transformWithOxc(source,'EventReview.jsx',{jsx:{runtime:'automatic'}});
 const code=transformed.code.replace(/from ["']([^"']+)["']/g,(_all,dep)=>'from '+JSON.stringify(dep.startsWith('.')?new URL(dep,url).href:import.meta.resolve(dep)));
 const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const html=renderToStaticMarkup(React.createElement(Component,{caseId:body.caseId,draft:{texts:[body.transcript1,body.transcript2],files:[],analysis:result.analysis},fetchImpl:()=>{throw new Error('No network allowed');}}));
 assert.match(html,/Reading incomplete—review required/);assert.match(html,/I acknowledge these reading gaps/);
 assert.match(html,/disabled=""[^>]*>Compare retained notes only/);assert.ok(!html.includes('Private citation diagnostic preview'));
 assert.match(html,/Transcript 1: 0\/2 chunks validated · 1 partial · 1 failed · 11 retained notes/);
 assert.match(html,/Transcript 2: 1\/1 chunks validated · 0 partial · 0 failed · 1 retained notes/);
 assert.match(html,/Unread or unvalidated ranges may contain contradictions/);
 const statusUrl=new URL('../../src/AnalysisStatus.jsx',import.meta.url),statusSource=await fs.readFile(statusUrl,'utf8');
 const transformedStatus=await transformWithOxc(statusSource,'AnalysisStatus.jsx',{jsx:{runtime:'automatic'}});
 const statusCode=transformedStatus.code.replace(/from ["']([^"']+)["']/g,(_all,dep)=>'from '+JSON.stringify(dep.startsWith('.')?new URL(dep,statusUrl).href:import.meta.resolve(dep)));
 const {default:Status}=await import('data:text/javascript;base64,'+Buffer.from(statusCode).toString('base64'));
 const statusHtml=renderToStaticMarkup(React.createElement(Status,{analysis:result.analysis,active:false}));
 assert.match(statusHtml,/Reading incomplete—review required/);assert.match(statusHtml,/Compare retained notes only/);
 assert.match(statusHtml,/0\/2 chunks validated/);assert.match(statusHtml,/11 retained notes/);

});

test('gap acknowledgement never turns a finished partial evidence review into complete coverage',async()=>{
 const {result}=await extracted();const request={...body,phase:'compare',eventState:result.analysis.eventState,acknowledgeExtractionGaps:true,extractionGapDigest:result.analysis.gapDigest};
 const prepared=await prepareEventWorkflow(request);let calls=0;
 const compared=await executeEventWorkflow({prepared,body:request,callModel:async p=>{calls++;const input=JSON.parse(p.messages[0].content);return msg({schemaVersion:1,rows:input.left.records.map(l=>({leftId:l.id,pairs:input.right.records.map(r=>({rightId:r.id,relation:'UNRESOLVED',reason:'Synthetic ambiguous relation.',comparisons:[]})),unrelatedRanges:[]}))});}});
 assert.equal(calls,1);assert.equal(compared.analysis.status,'reading_gaps');assert.equal(compared.analysis.comparisonFinished,true);
 assert.equal(compared.analysis.eventState.comparison.coverage.upstreamIncomplete,true);
 assert.equal(resumableCloudJobId({...compared.analysis,cloudJobId:jobId}),null);
 assert.equal(compared.analysis.eventState.extraction.gaps.length,2);
 const {buildReviewReport}=await import('../../src/lib/reviewReport.js');
 const report=buildReviewReport({title:'Synthetic gaps',draft:{texts:[body.transcript1,body.transcript2],analysis:compared.analysis,results:compared.contradictions}});
 assert.match(report,/Reading incomplete—review required/);assert.match(report,/Compare retained notes only/);
 assert.match(report,/Transcript 1: 0\/2 chunks validated · 1 partial · 1 failed · 11 retained notes/);
 assert.match(report,/Unread or unvalidated ranges may contain contradictions/);
 assert.ok(!report.includes('All planned comparisons completed — detection completeness is not guaranteed.'));

});
test('budget approval remains required; an insufficient allowance starts no transport',async()=>{
 const s=cloud(),api=s.make(),preview=response();await api.preview(req(body),preview);
 const invalid=response();await api.start(req({...body,approvedPlanId:'stale',approvedRequestCount:3,approvedMaxUsd:10}),invalid);assert.equal(invalid.code,400);assert.equal(s.mock.calls,0);
 const start=response();await api.start(req({...body,approvedPlanId:preview.value.id,approvedRequestCount:3,approvedMaxUsd:0.000001,allowPartialBudget:true}),start);assert.equal(start.code,200);
 const step=response();await api.step(req(),step);assert.equal(step.code,200);assert.equal(s.mock.calls,0);assert.equal(step.value.done,true);
 assert.equal(step.value.result.analysis.paidRequestsThisRun,0);assert.equal(step.value.spentUsd,0);assert.equal(step.value.result.analysis.budgetExhausted,true);assert.equal(step.value.result.analysis.readingFinished,false);
 assert.equal(resumableCloudJobId(step.value.result.analysis),null);
});
test('cancellation stops later hosted steps without repeating the in-flight request',async()=>{
 const s=cloud(),api=s.make(),preview=response();await api.preview(req(body),preview);
 const start=response();await api.start(req({...body,approvedPlanId:preview.value.id,approvedRequestCount:3,approvedMaxUsd:preview.value.cost.conservativeBudget}),start);
 const first=response();await api.step(req(),first);assert.equal(s.mock.calls,1);
 const cancelled=response();await api.cancel(req(),cancelled);const next=response();await api.step(req(),next);
 assert.equal(next.value.done,true);assert.equal(s.mock.calls,1);
});

test('failed provider/parse text is not copied into UI gap explanations',async()=>{
 const small={...body,transcript1:'Q: Synthetic question?\nA: Synthetic answer.',transcript2:'Q: Other question?\nA: Other answer.'};
 const prepared=await prepareEventWorkflow(small);let calls=0;
 const result=await executeEventWorkflow({prepared,body:small,callModel:async p=>{if(calls++===0)throw new Error('PRIVATE_DIAGNOSTIC_SNIPPET');return msg(valid(JSON.parse(p.messages[0].content)));}});
 assert.ok(result.analysis.eventState.extraction.tasks[0].error.includes('PRIVATE_DIAGNOSTIC_SNIPPET'));
 assert.ok(!JSON.stringify(result.analysis.gaps).includes('PRIVATE_DIAGNOSTIC_SNIPPET'));
});
