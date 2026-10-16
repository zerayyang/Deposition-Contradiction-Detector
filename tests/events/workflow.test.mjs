import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {createEventHandlers} from '../../server/events/handlers.js';
import {createJobStore} from '../../server/jobStore.js';
import {buildReviewReport} from '../../src/lib/reviewReport.js';
import {createCaseStore} from '../../src/lib/caseStore.js';
import {EventEmitter} from 'node:events';

// Scripted fictional testimony; expectations are tooling behavior, not accuracy.
const body=()=>({workflow:'events-v1',phase:'extract',caseId:'fictional-case',sameWitnessConfirmed:true,speakerRoles:[{},{}],documents:[],transcript1:'Q: Where were you on Monday evening?\nA: I was at home all evening.',transcript2:'Q: Where were you on Monday evening?\nA: I left home at 8 pm.'});
const message=response=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:50}});
function extraction(input){const units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);return {schemaVersion:1,events:units.map((s,i)=>({id:'e'+i,kind:'presence',summary:'Scripted proposed presence event',assertion:{polarity:'AFFIRMED',sourceIds:['w']},attributes:[{name:'location',state:'STATED',value:'home',basis:'WITNESS_WORDS',sourceIds:['w']}],qualifiers:[],relations:[],sources:[{id:'w',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),units:units.map((s,i)=>({unitId:s.id,status:'EVENTS',eventIds:['e'+i],reason:null}))};}
function comparison(input,extra={}){return {schemaVersion:1,rows:input.left.records.map(left=>({leftId:left.id,pairs:input.right.records.map(right=>({rightId:right.id,relation:'RELATED',reason:'Scripted shared Monday evening.',comparisons:[{issue:'Presence',type:'DIRECT',report:true,reasoning:'Scripted classification, not measured model performance.',leftSourceIds:[left.event.sources[0].id],rightSourceIds:[right.event.sources[0].id],missingContext:[],...extra}]})),unrelatedRanges:[]}))};}
const transport=async params=>{const input=JSON.parse(params.messages[0].content);return message(input.left?comparison(input):extraction(input));};
async function extract(input=body(),extra={}){const prepared=await prepareEventWorkflow(input);return executeEventWorkflow({prepared,body:input,callModel:transport,...extra});}
async function compare(input,extracted,extra={}){const request={...input,phase:'compare',eventState:extracted.analysis.eventState},prepared=await prepareEventWorkflow(request);return executeEventWorkflow({prepared,body:request,callModel:transport,...extra});}
const request=(body)=>({body,identity:{id:'owner'}});
function response(){const res=new EventEmitter();res.code=200;res.chunks=[];res.headers={};res.status=c=>{res.code=c;return res;};res.json=value=>{res.value=value;return res;};res.set=value=>{Object.assign(res.headers,value);return res;};res.flushHeaders=()=>{};res.write=value=>{res.chunks.push(JSON.parse(value));};res.end=()=>{res.writableEnded=true;};return res;}

test('phase previews are inert and extraction cannot silently begin comparison',async()=>{
 let calls=0;const input=body(),prepared=await prepareEventWorkflow(input);assert.equal(prepared.preview.phase,'extract');assert.equal(prepared.preview.requestCount,2);
 const result=await executeEventWorkflow({prepared,body:input,callModel:async(...args)=>{calls++;return transport(...args);}});
 assert.equal(calls,2);assert.equal(result.analysis.status,'awaiting_comparison');assert.equal(result.contradictions.length,0);assert.equal(result.analysis.eventState.comparison,null);
 await assert.rejects(()=>prepareEventWorkflow({...input,phase:'compare'}),/Finish complete/);
});
test('both phases round trip saved state, source binding, quotes and unchanged deterministic rules',async()=>{
 const input=body(),extracted=await extract(input),result=await compare(input,JSON.parse(JSON.stringify(extracted)));
 assert.equal(result.analysis.status,'complete');assert.equal(result.contradictions.length,1);
 const finding=result.contradictions[0];assert.equal(finding.type,'DIRECT');assert.equal(finding.claim1Valid,true);assert.equal(finding.claim2Valid,true);
 assert.equal(finding.sourceBindings.claim1.status,'BOUND');assert.equal(finding.sourceReferences.claim1[0].start,input.transcript1.indexOf(finding.claim1.original));
 assert.equal(finding.status,'CONFLICT_SUPPORTED');assert.ok(Number.isFinite(finding.score));assert.equal(finding.humanConfidence,finding.score);
});
test('categories and reasoning do not control numeric scores; unresolved meaning gates them',async()=>{
 const input=body(),extracted=await extract(input),normal=await compare(input,extracted);
 for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE']){const result=await compare(input,extracted,{callModel:async params=>message(comparison(JSON.parse(params.messages[0].content),{type,reasoning:'Different explanation.'}))});assert.equal(result.contradictions[0].score,normal.contradictions[0].score);}
 const unresolved=await compare(input,extracted,{callModel:async params=>message(comparison(JSON.parse(params.messages[0].content),{missingContext:['Shared occasion unclear.']}))});
 assert.equal(unresolved.contradictions[0].score,null);assert.equal(unresolved.contradictions[0].humanConfidence,null);assert.equal(unresolved.contradictions[0].status,'NOT_EVALUABLE');
 const unknown=body();unknown.sameWitnessConfirmed=false;const result=await compare(unknown,await extract(unknown));assert.equal(result.contradictions[0].score,null);
});
test('comparison approval IDs are stable across fresh extraction replay',async()=>{
 const input=body(),extracted=await extract(input),request={...input,phase:'compare',eventState:extracted.analysis.eventState};
 const first=await prepareEventWorkflow(request);await new Promise(resolve=>setTimeout(resolve,5));const second=await prepareEventWorkflow(JSON.parse(JSON.stringify(request)));
 assert.equal(first.preview.id,second.preview.id);
});
test('changed source, roles and backend identity cannot reuse prior extraction',async()=>{
 const input=body(),extracted=await extract(input),state=extracted.analysis.eventState;
 await assert.rejects(()=>prepareEventWorkflow({...input,phase:'compare',eventState:state,transcript1:input.transcript1+' extra'}),/different sources/);
 await assert.rejects(()=>prepareEventWorkflow({...input,phase:'compare',eventState:{...state,codeFingerprint:'other'}}),/backend changed/);
 const modified=structuredClone(state);modified.extraction.tasks[0].rawText=modified.extraction.tasks[0].rawText.replace('I was at home all evening.','Invented words.');
 await assert.rejects(()=>prepareEventWorkflow({...input,phase:'compare',eventState:modified}),/fresh validation/);
});
test('browser-supplied accepted arrays and scores are ignored during replay',async()=>{
 const input=body(),extracted=await extract(input);extracted.analysis.eventState.extraction.documents[0].events=[];
 const result=await compare(input,extracted);assert.equal(result.analysis.eventState.extraction.documents[0].events.length,1);assert.equal(result.contradictions.length,1);
});
test('partial extraction is visible and blocks comparison; only failed requests need fresh approval',async()=>{
 const input=body();let calls=0;const result=await extract(input,{callModel:async params=>{calls++;if(calls===2)throw new Error('Mock provider failure');return transport(params);}});
 assert.equal(result.analysis.status,'partial');assert.equal(result.analysis.eventState.extraction.documents[0].events.length,1);
 await assert.rejects(()=>prepareEventWorkflow({...input,phase:'compare',eventState:result.analysis.eventState}),/Finish complete/);
 const resume={...input,eventState:result.analysis.eventState},prepared=await prepareEventWorkflow(resume);assert.equal(prepared.preview.requestCount,1);assert.equal(prepared.preview.cachedRequests,1);
 let paid=0;const recovered=await executeEventWorkflow({prepared,body:resume,callModel:async params=>{paid++;return transport(params);}});assert.equal(paid,1);assert.equal(recovered.analysis.status,'awaiting_comparison');
});
test('all completed responses restore before checkpoints and zero-request recovery makes no new calls',async()=>{
 const input=body(),extracted=await extract(input),resume={...input,eventState:extracted.analysis.eventState},prepared=await prepareEventWorkflow(resume);
 assert.equal(prepared.preview.requestCount,0);let calls=0;const result=await executeEventWorkflow({prepared,body:resume,callModel:async()=>{calls++;throw new Error('No call permitted');}});
 assert.equal(calls,0);assert.equal(result.analysis.eventState.extraction.documents.length,2);assert.ok(result.analysis.eventState.extraction.tasks.every(t=>t.status==='COMPLETE'));
 const compared=await compare(input,extracted),again={...input,phase:'compare',eventState:compared.analysis.eventState},next=await prepareEventWorkflow(again);
 assert.equal(next.preview.requestCount,0);await executeEventWorkflow({prepared:next,body:again,callModel:async()=>{throw new Error('No paid repeat permitted');}});
});
test('cancel before calls preserves original coverage and returns cancelled, never complete',async()=>{
 const controller=new AbortController();controller.abort();const result=await extract(body(),{signal:controller.signal,callModel:async()=>{throw new Error('Must not call');}});
 assert.equal(result.analysis.status,'cancelled');assert.equal(result.analysis.paidRequestsThisRun,0);assert.equal(result.analysis.eventState.extraction.documents[0].coverage.status,'FAILED');
});
test('non-reportable comparisons remain in the saved audit and escaped printable report',async()=>{
 const input=body(),extracted=await extract(input),result=await compare(input,extracted,{callModel:async params=>message(comparison(JSON.parse(params.messages[0].content),{type:'FALSE_POSITIVE',report:false,reasoning:'<script>untrusted</script>'}))});
 assert.equal(result.contradictions.length,0);assert.equal(result.analysis.eventSummary.suppressedComparisons,1);
 const html=buildReviewReport({title:'Fictional',draft:{texts:[input.transcript1,input.transcript2],results:[],analysis:result.analysis}});
 assert.match(html,/Source-linked event audit/);assert.match(html,/Retained in audit/);assert.match(html,/&lt;script&gt;untrusted/);assert.ok(!html.includes('<script>untrusted'));
});
test('spending cap rejects without transport; exact approval required on stream',async()=>{
 await assert.rejects(()=>prepareEventWorkflow(body(),{maxBudgetUsd:0}),/allowance/);
 let calls=0;const handlers=createEventHandlers({callModel:async()=>{calls++;}}),res=response();await handlers.stream(request(body()),res);assert.equal(res.code,400);assert.equal(calls,0);
});
test('named speaker inspection exposes unresolved roles without guessing',()=>{
 const handlers=createEventHandlers({callModel:transport}),res=response();handlers.sources(request({...body(),transcript1:'BY MR. COUNSEL: Hello.\nMR. REED: I was home.'}),res);
 assert.equal(res.code,200);assert.ok(res.value.documents[0].labels.includes('MR. REED'));
});
test('durable owned checkpoints precede output and are isolated from other users',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'stage5-events-'));
 try{const store=createJobStore(directory),handlers=createEventHandlers({callModel:transport,jobStore:store}),input=body(),preview=response();await handlers.preview(request(input),preview);
 const res=response();await handlers.stream(request({...input,approvedPlanId:preview.value.id,approvedRequestCount:preview.value.requestCount,approvedMaxUsd:preview.value.cost.conservativeBudget}),res);
 assert.equal(res.code,200);const final=res.chunks.find(e=>e.event==='result');assert.equal(final.analysis.status,'awaiting_comparison');assert.ok(final.analysis.eventJobId);
 const record=await store.get(final.analysis.eventJobId,'owner');assert.equal(record.result.analysis.status,'awaiting_comparison');
 await assert.rejects(()=>store.get(record.id,'intruder'),/not found/);
 const compareBody={...input,phase:'compare',eventJobId:record.id,eventState:record.result.analysis.eventState},p=response();await handlers.preview(request(compareBody),p);assert.equal(p.code,200);assert.equal(p.value.phase,'compare');
 const incompatible=response();await handlers.preview(request({...compareBody,transcript1:input.transcript1+' modified'}),incompatible);assert.equal(incompatible.code,400);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('cloud case payload preserves event state and existing findings without changing database schema',async()=>{
 const result=await extract();let saved;
 const chain={update:payload=>{saved=payload;return chain;},eq:()=>chain,select:()=>chain,single:async()=>({data:{id:'case'},error:null})};
 const store=createCaseStore({from:()=>chain});await store.save('case',{texts:['left','right'],results:[],analysis:result.analysis,files:[],notes:{},reviewed:{},seconds:1});
 assert.deepEqual(JSON.parse(JSON.stringify(saved.results.analysis.eventState)),JSON.parse(JSON.stringify(result.analysis.eventState)));
});

test('a failed durable checkpoint stops every later paid request',async()=>{
 let calls=0;const store={list:async()=>[],create:async()=>({id:'job',provenance:{workflow:'events-v1'}}),activate:()=>{},deactivate:()=>{},checkpoint:async()=>{throw new Error('Mock disk failure');}};
 const handlers=createEventHandlers({jobStore:store,callModel:async params=>{calls++;return transport(params);}}),input=body(),preview=response();await handlers.preview(request(input),preview);
 const res=response();await handlers.stream(request({...input,approvedPlanId:preview.value.id,approvedRequestCount:preview.value.requestCount,approvedMaxUsd:preview.value.cost.conservativeBudget}),res);
 assert.equal(calls,1);assert.ok(res.chunks.some(e=>e.event==='error'));assert.ok(!res.chunks.some(e=>e.event==='result'));
});
test('corrupt completed cache cannot cause an unapproved replacement call',async()=>{
 const input=body(),extracted=await extract(input),state=structuredClone(extracted.analysis.eventState);state.extraction.tasks[1].rawText='{"broken":true}';
 const resume={...input,eventState:state},prepared=await prepareEventWorkflow(resume);assert.equal(prepared.preview.requestCount,0);
 let calls=0;await assert.rejects(()=>executeEventWorkflow({prepared,body:resume,callModel:async()=>{calls++;}}));assert.equal(calls,0);
});
test('event plans cannot override original texts through client metadata',async()=>{
 const input=body();input.documents=[{text:'Injected replacement source',documentId:'injected'},null];const prepared=await prepareEventWorkflow(input);
 assert.equal(prepared.extractionPlan.documents[0].text,input.transcript1);assert.equal(prepared.extractionPlan.documents[0].documentId,'transcript-1');
});
test('named witness roles require explicit review even for titled courtroom names',async()=>{
 const input=body();input.transcript1='MR. COUNSEL: Where were you Monday evening?\nMR. REED: I was at home all evening.';
 await assert.rejects(()=>prepareEventWorkflow(input),/Review the source role/);
 input.speakerRoles[0]={'MR. COUNSEL':'QUESTIONER','MR. REED':'WITNESS'};const plan=await prepareEventWorkflow(input);assert.ok(plan.preview.requestCount>0);
});
test('client routes event approvals separately while preserving the legacy request contract',async()=>{
 const {previewAnalysis,runAnalysis}=await import('../../src/lib/analysisClient.js');const calls=[];
 const fetchImpl=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return url.endsWith('plan')?new Response(JSON.stringify({id:'plan'}),{headers:{'content-type':'application/json'}}):new Response(JSON.stringify({event:'result',contradictions:[],analysis:{status:'complete'}})+'\n',{headers:{'content-type':'application/x-ndjson'}});};
 const plan={id:'plan',requestCount:2,cost:{conservativeBudget:1.2}};
 await previewAnalysis({workflow:'events-v1'},{fetchImpl});await runAnalysis({workflow:'events-v1'},plan,{fetchImpl});
 assert.equal(calls[0][0],'/api/events/plan');assert.equal(calls[1][0],'/api/events/stream');assert.equal(calls[1][1].approvedRequestCount,2);assert.equal(calls[1][1].approvedMaxUsd,1.2);
 calls.length=0;await runAnalysis({transcript1:'left',transcript2:'right'},plan,{fetchImpl});assert.deepEqual(calls[0],['/api/analyze/stream',{transcript1:'left',transcript2:'right',approvedPlanId:'plan'}]);
});
test('event controls and finding cards render saved source-linked records without raw diagnostic JSON',async()=>{
 const {readFile}=await import('node:fs/promises'),{transformWithOxc}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 async function component(name){const url=new URL('../../src/'+name,import.meta.url),source=await readFile(url,'utf8'),transformed=await transformWithOxc(source,name,{jsx:{runtime:'automatic'}});
 const code=transformed.code.replace(/from ["']([^"']+)["']/g,(_all,dep)=>'from '+JSON.stringify(dep.startsWith('.')?new URL(dep,url).href:import.meta.resolve(dep)));
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
 const input=body(),extracted=await extract(input),result=await compare(input,extracted),{default:EventReview}=await component('EventReview.jsx'),{ReviewCard}=await component('ReviewCard.jsx');
 const html=renderToStaticMarkup(React.createElement(EventReview,{caseId:'case',draft:{texts:[input.transcript1,input.transcript2],files:[],analysis:extracted.analysis},fetchImpl:()=>{throw new Error('Rendering must not fetch');},onCheckpoint:()=>{},onBusy:()=>{},onTick:()=>{},onTiming:()=>{}}));
 assert.match(html,/Review comparison cost/);assert.match(html,/Review extracted events/);assert.match(html,/Scripted proposed presence event/);assert.ok(!html.includes('"rawText"'));
 const card=renderToStaticMarkup(React.createElement(ReviewCard,{result:result.contradictions[0]}));assert.match(card,/Source-linked event details/);assert.match(card,/Witness context/);
});
