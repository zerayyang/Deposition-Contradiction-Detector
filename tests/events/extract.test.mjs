import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan,previewEventExtractionPlan,executeEventExtraction} from '../../server/events/extract.js';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {witnessQuoteMatches} from '../../server/sourceEvidence.js';
import {parseExtractionMessage,materializeExtraction,validateEventRecords} from '../../server/events/extractionProtocol.js';

const text='Q: What happened on Monday?\nA: I signed the form.\nQ: Were others present?\nA: I do not remember.';
const source=(value=text,extra={})=>({documentId:'fictional-one',text:value,...extra});
const planFor=(value=text,options={})=>buildEventExtractionPlan([source(value)],options);
const approval=plan=>({planId:plan.id,requestCount:plan.requestCount,maxUsd:plan.cost.conservativeBudget});
const answer=(task)=>{
 const owned=task.input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);
 const events=owned.filter(s=>s.text.trim()).map((s,i)=>({id:`e${i}`,kind:'unrestricted_new_event_kind',summary:'Mock interpretation, not measured model quality.',
  assertion:{polarity:'AFFIRMED',sourceIds:['a']},attributes:[],qualifiers:[],relations:[],
  sources:[{id:'a',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]}));
 let at=0;
 return {schemaVersion:1,events,units:owned.map(s=>s.text.trim()?{unitId:s.id,status:'EVENTS',eventIds:[events[at++].id],reason:null}:{unitId:s.id,status:'NO_EVENT',eventIds:[],reason:'This fragment contains whitespace only.'})};
};
const message=(response,extra={})=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(response)}],usage:{input_tokens:100,output_tokens:50},...extra});
const run=(plan,transform=r=>r,extra={})=>executeEventExtraction({plan,approval:approval(plan),callModel:async p=>{
 const input=JSON.parse(p.messages[0].content),task=plan.tasks.find(t=>t.input.documentId===input.documentId&&t.coreStart===input.range.coreStart);
 return message(transform(answer(task),task),extra);
}});

test('short plan is inert, immutable, source linked and uses a dedicated extraction prompt',()=>{
 const plan=planFor(),preview=previewEventExtractionPlan(plan);
 assert.equal(plan.requestCount,1);assert.equal(preview.requestCount,1);assert.equal(plan.id,planFor().id);
 assert.ok(Object.isFrozen(plan));assert.ok(plan.system.includes('Do not compare'));
 assert.ok(!JSON.stringify(preview).includes('I signed the form.'));
 assert.equal(plan.tasks[0].input.text,text);assert.ok(plan.cost.conservativeBudget>=plan.cost.estimated);
 assert.notEqual(plan.id,planFor(text+' ').id);
});
test('two documents extract independently rather than multiplying section comparisons',async()=>{
 const plan=buildEventExtractionPlan([source(),source(text.replace('signed','read'),{documentId:'fictional-two'})]);
 assert.equal(plan.requestCount,2);
 const result=await run(plan);assert.equal(result.status,'COMPLETE');assert.equal(result.documents.length,2);
 assert.ok(result.documents.every(d=>d.recordValidation.valid&&d.events.length===2));
 assert.ok(result.documents[0].events[0].id!==result.documents[1].events[0].id);
 assert.equal(result.usage.attempted,2);assert.equal(result.usage.inputTokens,200);
 for(const event of result.documents.flatMap(d=>d.events)){assert.equal('score' in event,false);assert.equal('type' in event,false);}
});
test('open-ended event kinds, explicit unknowns and uncertain assertions remain proposed semantics',async()=>{
 const plan=planFor();const result=await run(plan,r=>{
  const e=r.events[1];e.assertion.polarity='UNCERTAIN';e.reviewRequired=true;e.unresolvedReasons=['Mock uncertainty remains unresolved.'];
  e.attributes=[{name:'companions',state:'UNSTATED',value:null,basis:'NONE',sourceIds:[]}];return r;
 });
 assert.equal(result.status,'COMPLETE');assert.equal(result.documents[0].events[1].attributes[0].value,null);
 assert.equal(result.documents[0].events[1].assertion.polarity,'UNCERTAIN');
 assert.ok(result.documents[0].recordValidation.valid);
});
test('missing answer dispositions remain visible even with valid event records',async()=>{
 const result=await run(planFor(),r=>({...r,units:[]}));
 assert.equal(result.status,'PARTIAL');assert.equal(result.documents[0].events.length,2);
 assert.ok(result.tasks[0].issues.some(i=>i.code==='MISSING_UNIT_REVIEW'));
 assert.ok(result.tasks[0].issues.some(i=>i.code==='UNACCOUNTED_EVENT'));
 assert.equal(result.documents[0].coverage.status,'FAILED');
});
test('NO_EVENT is an explicit checkable model judgment, not proof of exhaustive recall',async()=>{
 const result=await run(planFor(),r=>({...r,events:[],units:r.units.map(u=>({...u,status:'NO_EVENT',eventIds:[],reason:'Mock non-event disposition.'}))}));
 assert.equal(result.status,'COMPLETE');assert.equal(result.documents[0].events.length,0);
 assert.match(result.documents[0].notice,/not exhaustive event recall/);
});
test('unresolved and malformed dispositions cannot report complete',async()=>{
 for(const mutate of [u=>({...u,status:'UNRESOLVED',eventIds:[],reason:'Needs interpretation.'}),u=>({...u,status:'NO_EVENT',eventIds:[],reason:null}),u=>({...u,status:'EVENTS',eventIds:[]}),u=>({...u,confidence:0.9})]){
  const result=await run(planFor(),r=>({...r,units:r.units.map(mutate)}));assert.notEqual(result.status,'COMPLETE');
 }
});
test('duplicate/extra units and wrong event-unit links are explicit issues',async()=>{
 for(const mutate of [r=>({...r,units:[...r.units,r.units[0]]}),r=>({...r,units:[...r.units,{...r.units[0],unitId:'invented'}]}),r=>({...r,units:r.units.map(u=>({...u,eventIds:['invented']}))}),r=>({...r,units:[{...r.units[0],eventIds:r.units[1].eventIds},r.units[1]]})]){
  const result=await run(planFor(),mutate);assert.equal(result.status,'PARTIAL');assert.ok(result.tasks[0].issues.length);
 }
});
test('bad quotation is quarantined while other valid records and raw response survive',async()=>{
 const result=await run(planFor(),r=>{r.events[0].sources[0].quote='Invented passage.';return r;});
 assert.equal(result.status,'PARTIAL');assert.equal(result.documents[0].events.length,1);
 assert.equal(result.tasks[0].rejected.length,1);assert.ok(result.tasks[0].rawText.includes('Invented passage.'));
 assert.equal(result.tasks[0].response.events.length,2);
});
test('changed punctuation is rejected rather than normalized or auto-corrected',async()=>{
 const result=await run(planFor(),r=>{r.events[0].sources[0].quote='I signed the form!';return r;});
 assert.equal(result.tasks[0].rejected.length,1);assert.match(result.tasks[0].rejected[0].errors[0].message,/verbatim/);
});
test('model role/offset/page/score injection and confidence attributes are rejected',async()=>{
 for(const mutate of [e=>{e.score=90;},e=>{e.sources[0].role='WITNESS';},e=>{e.sources[0].start=0;},e=>{e.sources[0].pageRefs=[];},e=>{e.attributes.push({name:'confidence_estimate',state:'UNSTATED',value:null,basis:'NONE',sourceIds:[]});}]){
  const result=await run(planFor(),r=>{mutate(r.events[0]);return r;});assert.equal(result.tasks[0].rejected.length,1);assert.notEqual(result.status,'COMPLETE');
 }
 const result=await run(planFor(),r=>({...r,confidence:95}));assert.equal(result.status,'FAILED');assert.equal(result.documents[0].events.length,0);
});
test('question-only assertions cannot become witness events',async()=>{
 const result=await run(planFor(),r=>{const q=planFor().tasks[0].input.sources.find(s=>s.role==='QUESTION');r.events[0].sources[0]={id:'a',unitId:q.id,quote:q.text.trim(),occurrence:0};return r;});
 assert.equal(result.tasks[0].rejected.length,1);
});
test('wrong governing question and nonliteral attributes fail the existing source validator',async()=>{
 const plan=planFor();const result=await run(plan,r=>{
  const q=plan.tasks[0].input.sources.filter(s=>s.role==='QUESTION')[1];
  r.events[0].sources.push({id:'q',unitId:q.id,quote:q.text.trim(),occurrence:0});return r;
 });assert.ok(result.tasks[0].rejected[0].errors.some(e=>e.code==='QUESTION_NOT_GOVERNING'));
 const other=await run(plan,r=>{r.events[0].attributes.push({name:'location',state:'STATED',value:'An invented place',basis:'WITNESS_WORDS',sourceIds:['a']});return r;});
 assert.ok(other.tasks[0].rejected[0].errors.some(e=>e.code==='FIELD_NOT_LITERAL'));
});
test('repeated quotation never silently selects the first occurrence',async()=>{
 const plan=planFor('Q: What did you say?\nA: Yes. Yes.');
 const ambiguous=await run(plan,r=>{r.events[0].sources[0].quote='Yes.';r.events[0].sources[0].occurrence=null;return r;});
 assert.equal(ambiguous.documents[0].events.length,0);assert.match(ambiguous.tasks[0].rejected[0].errors[0].message,/explicit occurrence/);
 const selected=await run(plan,r=>{r.events[0].sources[0].quote='Yes.';r.events[0].sources[0].occurrence=1;return r;});
 assert.equal(selected.status,'COMPLETE');assert.equal(selected.documents[0].events[0].sources[0].start,plan.documents[0].text.lastIndexOf('Yes.'));
});
test('duplicate model IDs are all retained for rejection review, not overwritten',async()=>{
 const result=await run(planFor(),r=>{r.events[1].id=r.events[0].id;return r;});
 assert.equal(result.tasks[0].rejected.length,2);assert.equal(result.documents[0].events.length,0);
});
test('invalid correction target quarantines dependent records without rewriting links',async()=>{
 const result=await run(planFor(),r=>{r.events[0].sources[0].quote='Invented.';r.events[1].relations=[{kind:'CORRECTS',targetEventId:'e0',explanation:'Mock correction.'}];return r;});
 assert.equal(result.documents[0].events.length,0);assert.equal(result.tasks[0].rejected.length,2);
 assert.equal(result.tasks[0].response.events[1].relations[0].targetEventId,'e0');
});
test('malformed JSON, fences, truncation and missing envelope are failures with raw audit/usage',async()=>{
 const plan=planFor();
 for(const msg of [message({}, {content:[{type:'text',text:'{'}]}),message({}, {content:[{type:'text',text:'```json\n{}\n```'}]}),message(answer(plan.tasks[0]),{stop_reason:'max_tokens'}),message({events:[]})]){
  const result=await executeEventExtraction({plan,approval:approval(plan),callModel:async()=>msg});
  assert.equal(result.status,'FAILED');assert.ok(result.tasks[0].rawText);assert.equal(result.usage.outputTokens,50);
 }
});
test('approval, request cap and stale plans prevent any model invocation',async()=>{
 const plan=planFor();let calls=0;const callModel=async()=>{calls++;};
 for(const approved of [null,{...approval(plan),planId:'stale'},{...approval(plan),requestCount:2},{...approval(plan),maxUsd:0}])await assert.rejects(executeEventExtraction({plan,approval:approved,callModel}),/approval/);
 const changed=structuredClone(plan);changed.tasks[0].input.text+='changed';await assert.rejects(executeEventExtraction({plan:changed,approval:approval(plan),callModel}),/changed/);
 assert.throws(()=>planFor(text,{chunkBytes:35,overlapBytes:5,maxRequests:1}),/above the configured cap/);assert.equal(calls,0);
});
test('invalid documents, source roles, OCR pages and stale manifests stop planning without calls',()=>{
 assert.throws(()=>buildEventExtractionPlan([]));assert.throws(()=>buildEventExtractionPlan([source(),source()]));
 assert.throws(()=>planFor(''),/non-empty/);assert.throws(()=>planFor('Q: Anything?\nA: '),/no supported witness/);assert.throws(()=>planFor('ALEX: I left.'),/WITNESS_CONFIRMATION_REQUIRED/);
 assert.throws(()=>buildEventExtractionPlan([source('ALEX: I left.',{witnessTestimonyConfirmed:true})]),/unresolved speaker/);
 assert.throws(()=>planFor('THE COURT: Wait.'),/WITNESS_CONFIRMATION_REQUIRED/);
 assert.throws(()=>buildEventExtractionPlan([source('THE COURT: Wait.',{witnessTestimonyConfirmed:true})]),/no supported witness/);
 assert.throws(()=>buildEventExtractionPlan([source(text,{extraction:{textSha256:'bad',textLength:text.length}})]),/page map/);
 const extraction={textSha256:createHash('sha256').update(text).digest('hex'),textLength:text.length,pageCount:1,pages:[{pdfPage:1,pageLabel:'1',start:0,end:text.length,status:'OCR_REQUIRED'}]};
 assert.throws(()=>buildEventExtractionPlan([source(text,{extraction})]),/OCR/);
 for(const options of [{chunkBytes:0},{overlapBytes:-1},{chunkBytes:10,overlapBytes:10},{outputTokens:0},{timeoutMs:0}])assert.throws(()=>planFor(text,options));
});
test('named speaker metadata enables extraction; roles never come from the model',async()=>{
 const text='MS. REED: What happened?\nPRESIDENT VALE: I left.';
 const plan=buildEventExtractionPlan([source(text,{speakerRoles:{'MS. REED':'QUESTIONER','PRESIDENT VALE':'WITNESS'}})]);
 const result=await run(plan);assert.equal(result.status,'COMPLETE');assert.equal(result.tasks[0].anchorAudit[0].sources[0].speaker,'PRESIDENT VALE');
});
test('continued answers preserve their full governing question and every source character',async()=>{
 const value='Q: Where were you on Monday?\nA: '+'A long literal answer 📄. '.repeat(40);
 const plan=planFor(value,{chunkBytes:180,overlapBytes:40});
 assert.equal(plan.tasks.map(t=>value.slice(t.coreStart,t.coreEnd)).join(''),value);
 for(const task of plan.tasks.filter(t=>t.mode==='MODEL')){
  const witness=task.input.sources.find(s=>s.role==='WITNESS'&&s.assigned);
  assert.equal(task.input.sources.find(s=>s.id===witness.questionUnitId).text.trim(),'Where were you on Monday?');
  for(const unit of task.input.sources)assert.equal(value.slice(unit.start,unit.end),unit.text);
 }
 const result=await run(plan);assert.equal(result.status,'COMPLETE',JSON.stringify(result.tasks.filter(t=>t.status!=='COMPLETE').map(t=>({id:t.id,issues:t.issues,error:t.error}))));assert.ok(result.documents[0].recordValidation.valid);
 assert.equal(result.documents[0].coverage.segments.map(s=>value.slice(s.start,s.end)).join(''),value);
});
function pagedDocument(count=225){
 const texts=Array.from({length:count},(_,i)=>`Q: What happened at event ${i}?\nA: I recorded item ${i}.`),value=texts.join('\n\n');let at=0;
 const pages=texts.map((t,i)=>{const page={pdfPage:i+1,pageLabel:String(i+10),start:at,end:at+t.length,status:'TEXT'};at=page.end+2;return page;});
 return source(value,{extraction:{textSha256:createHash('sha256').update(value).digest('hex'),textLength:value.length,pageCount:count,pages}});
}
test('225-page input retains complete coverage and code-derived original page references',async()=>{
 const input=pagedDocument(),before=structuredClone(input);
 const plan=buildEventExtractionPlan([input],{chunkBytes:1800,overlapBytes:120});
 assert.deepEqual(input,before);assert.equal(Object.isFrozen(input.extraction.pages),false);
 const result=await run(plan);assert.equal(result.status,'COMPLETE');assert.ok(result.documents[0].recordValidation.valid);
 const pages=new Set(result.documents[0].events.flatMap(e=>e.sources.flatMap(s=>s.pageRefs.map(p=>p.pdfPage))));
 assert.equal(pages.size,225);
 assert.equal(result.documents[0].coverage.segments.map(s=>input.text.slice(s.start,s.end)).join(''),input.text);
 assert.ok(result.documents[0].events.some(e=>e.sources.some(s=>s.pageRefs.some(p=>p.pageLabel==='234'))));
});
test('provider errors do not retry; later sections may succeed and failed ranges stay visible',async()=>{
 const plan=planFor(text,{chunkBytes:55,overlapBytes:10});let calls=0;
 const result=await executeEventExtraction({plan,approval:approval(plan),callModel:async(params,options)=>{
  assert.equal(options.maxRetries,0);if(++calls===1)throw new Error('Mock provider failure.');
  const input=JSON.parse(params.messages[0].content);return message(answer(plan.tasks.find(t=>t.coreStart===input.range.coreStart)));
 }});
 assert.equal(calls,plan.requestCount);assert.equal(result.status,'READING_GAPS');assert.ok(result.documents[0].coverage.segments.some(s=>s.status==='FAILED'));
 assert.equal(result.usage.estimatedUsd,null);assert.equal(result.usage.unavailableRequests,1);
});
test('cancellation before execution and during a hung call stops every later request',async()=>{
 const plan=planFor(text,{chunkBytes:55,overlapBytes:10});let calls=0;const before=new AbortController();before.abort();
 const none=await executeEventExtraction({plan,approval:approval(plan),signal:before.signal,callModel:async()=>{calls++;}});
 assert.equal(none.status,'CANCELLED');assert.equal(calls,0);
 const controller=new AbortController();const result=await executeEventExtraction({plan,approval:approval(plan),signal:controller.signal,callModel:async()=>{calls++;queueMicrotask(()=>controller.abort());return new Promise(()=>{});}});
 assert.equal(result.status,'CANCELLED');assert.equal(calls,1);assert.equal(result.usage.estimatedUsd,null);
 assert.ok(result.documents[0].coverage.segments.some(s=>s.status==='UNPROCESSED'));
});
test('timeouts are failures and callback failures stop subsequent paid work with a partial snapshot',async()=>{
 const plan=planFor(text,{chunkBytes:55,overlapBytes:10,timeoutMs:10});
 // Keep the event loop alive because AbortSignal.timeout timers are unref'ed.
 const keepAlive=setInterval(()=>{},1000);
 try{const timed=await executeEventExtraction({plan,approval:approval(plan),callModel:async()=>new Promise(()=>{})});assert.equal(timed.status,'FAILED');}
 finally{clearInterval(keepAlive);}
 let calls=0;
 await assert.rejects(executeEventExtraction({plan,approval:approval(plan),callModel:async p=>{calls++;const input=JSON.parse(p.messages[0].content);return message(answer(plan.tasks.find(t=>t.coreStart===input.range.coreStart)));},onEvent:async e=>{if(e.event==='checkpoint')throw new Error('Mock checkpoint failure.');}}),error=>Boolean(error.extractionResult));
 assert.equal(calls,1);
});
test('missing or unpriced cached usage never becomes a fake zero-cost estimate',async()=>{
 for(const usage of [undefined,{input_tokens:100},{input_tokens:-1,output_tokens:50},{input_tokens:100,output_tokens:50,cache_read_input_tokens:20}]){
  const result=await run(planFor(),r=>r,{usage});assert.equal(result.usage.estimatedUsd,null);
 }
 const result=await run(planFor());assert.equal(result.usage.inputTokens,100);assert.equal(result.usage.outputTokens,50);assert.equal(result.usage.estimatedUsd,0.0014);
});
test('wire and proposed records are never mutated during source validation',()=>{
 const plan=planFor(),task=plan.tasks[0],response=answer(task),before=structuredClone(response);
 const result=materializeExtraction(response,task,plan.documents[0]);assert.deepEqual(response,before);
 const events=structuredClone(result.events),saved=structuredClone(events);assert.equal(validateEventRecords(events,plan.documents[0]).valid,true);assert.deepEqual(events,saved);
 assert.throws(()=>parseExtractionMessage({stop_reason:'end_turn',content:[{type:'text',text:'null'}]}));
});

test('overlapping literal occurrences remain verifiable at their exact offsets',()=>{
 const value='Q: Repeat?\nA: aaaaa';
 assert.deepEqual(witnessQuoteMatches(value,'aaa').map(m=>m.index),[value.indexOf('aaaaa'),value.indexOf('aaaaa')+1,value.indexOf('aaaaa')+2]);
});

test('large source indexing keeps all turns but bounds working context history',()=>{
 const value=Array.from({length:3000},(_,i)=>`Q: What happened at event ${i}?\nA: Event ${i} was recorded.\n`).join('');
 const parsed=parseTestimonySource(value);
 assert.equal(parsed.turns.length,6000);
 const answers=parsed.turns.filter(t=>t.role==='WITNESS');
 assert.ok(answers.every(t=>t.questions.length<=4));
 assert.deepEqual(answers.at(-1).questions,[2996,2997,2998,2999].map(i=>`What happened at event ${i}?`));
 assert.equal(parsed.turns.map(t=>value.slice(t.start,t.end)).join(''),value);
});

test('small explicit output budgets do not produce an estimate above the reserved budget',()=>{
 const plan=planFor(text,{outputTokens:100});assert.ok(plan.cost.estimated<=plan.cost.conservativeBudget);
});
test('progress consumers cannot mutate retained source records or the raw audit',async()=>{
 const plan=planFor();const result=await executeEventExtraction({plan,approval:approval(plan),callModel:async()=>message(answer(plan.tasks[0])),onEvent:event=>{
  if(event.event==='checkpoint'){
   event.result.tasks[0].response.events[0].summary='Changed by callback';
   event.result.documents[0].events.length=0;
  }
 }});
 assert.equal(result.documents[0].events.length,2);
 assert.notEqual(result.tasks[0].response.events[0].summary,'Changed by callback');
});

test('dense answers are divided by output capacity without losing any assigned source range',async()=>{
 const dense=Array.from({length:70},(_,i)=>`Q: Which form was signed on day ${i+1}?\nA: I signed form ${i+1}.`).join('\n');
 const plan=planFor(dense,{chunkBytes:16000,overlapBytes:500,maxWitnessUnits:12,maxRequests:100});
 assert.ok(plan.requestCount>1);assert.equal(plan.outputTokens,32768);
 for(const task of plan.tasks)assert.ok(task.input.sources.filter(s=>s.role==='WITNESS'&&s.assigned).length<=12);
 let end=0;for(const task of plan.tasks){assert.equal(task.coreStart,end);end=task.coreEnd;}assert.equal(end,dense.length);
 const result=await run(plan);assert.equal(result.status,'COMPLETE');assert.equal(result.documents[0].coverage.status,'COMPLETE');
 assert.equal(result.documents[0].events.length,70);
});

test('question-derived attributes must occur with exact case inside their cited question quote',async()=>{
 const plan=planFor('Q: You were Director and President in May 2026?\nA: Yes.');
 const transform=(response,task,{full=true,value='Director'}={})=>{const q=task.input.sources.find(s=>s.role==='QUESTION');const event=response.events[0];event.sources.push({id:'q',unitId:q.id,quote:full?q.text.trim():'You were',occurrence:0});event.attributes=[{name:'role',state:'STATED',value,basis:'QUESTION_CONTEXT',sourceIds:['q']}];return response;};
 const valid=await run(plan,(r,t)=>transform(r,t));assert.equal(valid.status,'COMPLETE');
 for(const options of [{full:false},{value:'director'}]){const invalid=await run(plan,(r,t)=>transform(r,t,options));assert.equal(invalid.status,'FAILED');assert.ok(invalid.tasks[0].rejected[0].errors.some(e=>e.code==='FIELD_NOT_LITERAL'));}
});
