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

test('planning is inert and preserves existing classification instructions verbatim',()=>{
 const plan=planFor(),preview=previewEventComparisonPlan(plan),instructions=fs.readFileSync(new URL('../../server/proper_prompts.md',import.meta.url),'utf8');
 const prefix=instructions.slice(0,instructions.indexOf('## 6. Required Output'));
 assert.ok(plan.system.startsWith(prefix));assert.equal(plan.classificationSha256,hash(prefix));
 assert.equal(plan.pairCount,4);assert.equal(plan.requestCount,1);assert.equal(preview.pairCount,4);
 assert.equal(Object.isFrozen(plan),true);assert.equal(plan.id,planFor().id);
});
test('reordered and differently named events cross every block without exact-word/type filtering',async()=>{
 const plan=planFor(fixture(),{eventsPerBlock:1}),seen=[];
 const result=await run(plan,input=>{seen.push([input.left.records[0].event.sources[0].quote,input.right.records[0].event.sources[0].quote]);return related(input);});
 assert.equal(plan.requestCount,4);assert.equal(seen.length,4);assert.ok(seen.some(([a,b])=>a==='I signed the form.'&&b==='I did not sign the form.'));
 assert.ok(seen.some(([a,b])=>a==='I drove the van.'&&b==='I drove the car.'));
 assert.equal(result.status,'COMPLETE');assert.equal(result.coverage.accountedPairs,4);
 assert.equal(result.comparisons.length,4);assert.equal(result.findings.length,4);
});
test('each assigned pair can be explicitly unrelated without a fabricated type or score',async()=>{
 const result=await run(planFor(),unrelated);
 assert.equal(result.status,'COMPLETE');assert.equal(result.coverage.accountedPairs,4);assert.equal(result.findings.length,0);
 assert.equal(result.tasks[0].unrelated.length,2);assert.match(result.tasks[0].unrelated[0].notice,/not a deterministic proof/);
});
test('compatible and identical comparisons stay in the audit even when reporting rules suppress a card',async()=>{
 const result=await run(planFor(),input=>related(input,{type:'FALSE_POSITIVE',report:false}));
 assert.equal(result.status,'COMPLETE');assert.equal(result.comparisons.length,4);assert.equal(result.findings.length,0);
 assert.ok(result.comparisons.every(c=>c.type==='FALSE_POSITIVE'&&c.variants[0].report===false));
});
test('multiple independent issues in one event pair survive without a one-pair/one-issue cap',async()=>{
 const plan=planFor(fixture(['An assertion.'],['Another assertion.']));
 const result=await run(plan,input=>{const r=related(input);r.rows[0].pairs[0].comparisons.push(comparison(input.left.records[0],input.right.records[0],{issue:'Second independent issue',type:'INFERENTIAL'}));return r;});
 assert.equal(result.comparisons.length,2);assert.deepEqual(result.comparisons.map(c=>c.type),['DIRECT','INFERENTIAL']);
});
test('unknown witness identity, ambiguity and missing event scope remain review flags',async()=>{
 const plan=planFor(fixture(),{sameWitnessConfirmed:false});
 const result=await run(plan,input=>related(input,{missingContext:['Shared occasion needs clarification.']}));
 assert.ok(result.comparisons.every(c=>c.reviewRequired));
 const unresolved=await run(plan,input=>({...related(input),rows:input.left.records.map(left=>({leftId:left.id,pairs:input.right.records.map(right=>({rightId:right.id,relation:'UNRESOLVED',reason:'Event identity not established.',comparisons:[]})),unrelatedRanges:[]}))}));
 assert.equal(unresolved.status,'COMPLETE');assert.equal(unresolved.comparisons.length,0);assert.ok(unresolved.tasks[0].pairs.every(p=>p.reviewRequired));
});
test('missing rows, missing cells, duplicate rows/cells and invalid unrelated ranges never report complete',async()=>{
 const plan=planFor();
 const cases=[r=>({...r,rows:[]}),r=>{r.rows[0].unrelatedRanges=[];return r;},r=>({...r,rows:[...r.rows,r.rows[0]]}),r=>{r.rows[0].unrelatedRanges.push(r.rows[0].unrelatedRanges[0]);return r;},r=>{r.rows[0].unrelatedRanges[0].end=999;return r;},r=>{r.rows[0].unrelatedRanges[0].start=1;return r;}];
 for(const mutate of cases){const result=await run(plan,input=>mutate(unrelated(input)));assert.notEqual(result.status,'COMPLETE');assert.ok(result.tasks[0].issues.length);}
});
test('related/unrelated overlap retains the disputed comparison and flags its coverage conflict',async()=>{
 const result=await run(planFor(),input=>{const r=related(input);r.rows[0].unrelatedRanges=[{start:0,end:1,reason:'Conflicting mock disposition.'}];return r;});
 assert.equal(result.status,'PARTIAL');assert.ok(result.tasks[0].issues.some(i=>i.code==='DUPLICATE_PAIR'));
 assert.equal(result.tasks[0].pairs[0].coverageConflict,true);assert.equal(result.tasks[0].comparisons[0].reviewRequired,true);
});
test('invented or opposite-document citations fail, while valid sibling comparisons survive',async()=>{
 const plan=planFor(fixture(['Left fact.'],['Right fact.']));
 const result=await run(plan,input=>{const r=related(input),bad=comparison(input.left.records[0],input.right.records[0],{issue:'Invalid citation',leftSourceIds:['invented']});r.rows[0].pairs[0].comparisons.push(bad);return r;});
 assert.equal(result.status,'PARTIAL');assert.equal(result.comparisons.length,1);assert.equal(result.tasks[0].rejected.length,1);assert.ok(result.tasks[0].rawText.includes('invented'));
});
test('model numeric confidence/evidence and rewritten quotation fields are rejected without coercion',async()=>{
 for(const extra of [{score:90},{confidence:0.9},{evidenceStatus:'CONFLICT'},{leftQuote:'Invented quote.'},{type:'UNRESOLVED'}]){
  const result=await run(planFor(),input=>related(input,extra));assert.notEqual(result.status,'COMPLETE');assert.equal(result.comparisons.length,0);assert.ok(result.tasks[0].rejected.length);
 }
});
test('one malformed issue cannot erase a valid independent issue',async()=>{
 const plan=planFor(fixture(['Left.'],['Right.']));
 const result=await run(plan,input=>{const r=related(input);r.rows[0].pairs[0].comparisons.push({...r.rows[0].pairs[0].comparisons[0],issue:'Bad issue',score:100});return r;});
 assert.equal(result.status,'PARTIAL');assert.equal(result.comparisons.length,1);assert.equal(result.tasks[0].rejected.length,1);
});
test('literal duplicate records group losslessly but changed interpretations remain separate',()=>{
 const data=fixture(['A statement.'],['Other statement.']),doc=data.extractionResult.documents[0],copy=structuredClone(doc.events[0]);
 copy.id='copy';copy.sources[0].id='copy-source';copy.assertion.sourceIds=['copy-source'];copy.attributes[0].sourceIds=['copy-source'];doc.events.push(copy);doc.coverage.segments[0].eventIds.push(copy.id);
 const grouped=planFor(data);assert.equal(grouped.catalogs[0].length,1);assert.equal(grouped.catalogs[0][0].members.length,2);assert.equal(grouped.documents[0].duplicatesGrouped,1);
 copy.summary='A distinct proposed interpretation.';assert.equal(planFor(data).catalogs[0].length,2);
});
test('corrections are supplied in both directions across distant blocks without deleting earlier records',()=>{
 const data=fixture(['Original assertion.','Unrelated middle.','Corrected assertion.'],['Other statement.']),events=data.extractionResult.documents[0].events;
 events[2].relations=[{kind:'CORRECTS',targetEventId:events[0].id,explanation:'Explicit synthetic correction link.'}];
 const plan=planFor(data,{eventsPerBlock:1});
 const first=plan.tasks.find(t=>t.input.left.records[0].event.id==='e0').input.left;
 const last=plan.tasks.find(t=>t.input.left.records[0].event.id==='e2').input.left;
 assert.ok(first.supportingRecords.some(r=>r.event.id==='e2'));assert.ok(last.supportingRecords.some(r=>r.event.id==='e0'));
 assert.equal(plan.catalogs[0].length,3);
});
test('full answers and governing questions survive short extracted quotations',()=>{
 const data=fixture(['I signed it, but only as a witness.'],['I did not sign as an officer.']);
 const e=data.extractionResult.documents[0].events[0];e.sources[0].quote='I signed it';e.sources[0].end=e.sources[0].start+e.sources[0].quote.length;e.attributes=[];
 const plan=planFor(data),context=plan.tasks[0].input.left.contexts[0];
 assert.match(context.answer,/but only as a witness/);assert.equal(context.question.text,'Tell me about item 0.');
});
test('source/hash/coverage tampering and missing extraction context block planning',()=>{
 for(const mutate of [d=>{d.extractionResult.planId='wrong';},d=>{d.extractionResult.documents[0].documentSha256='0'.repeat(64);},d=>{d.extractionResult.documents[0].events[0].sources[0].quote='Invented';},d=>{d.extractionResult.documents[0].coverage.segments[0].start=1;},d=>{d.extractionResult.status='invented';}]){
  const data=fixture();mutate(data);assert.throws(()=>planFor(data));
 }
});
test('partial extraction requires explicit opt-in and can never yield a complete comparison run',async()=>{
 const data=fixture();data.extractionResult.status='PARTIAL';data.extractionResult.documents[0].coverage.segments[0].status='FAILED';data.extractionResult.documents[0].coverage.segments[0].reason='Mock extraction failure.';data.extractionResult.documents[0].coverage.status='FAILED';
 assert.throws(()=>planFor(data),/incomplete/);
 const plan=planFor(data,{allowPartialExtraction:true}),result=await run(plan,unrelated);
 assert.equal(result.status,'PARTIAL');assert.equal(result.coverage.upstreamIncomplete,true);assert.equal(result.documents[0].extractionCoverage.segments[0].status,'FAILED');
});
test('caps and context exhaustion fail explicitly without silently reducing event coverage',()=>{
 assert.throws(()=>planFor(fixture(),{eventsPerBlock:1,maxRequests:1}),/above the configured cap/);
 assert.throws(()=>planFor(fixture(),{maxPairs:1}),/above the configured cap/);
 assert.throws(()=>planFor(fixture(),{eventsPerBlock:129}),/128/);
 assert.throws(()=>planFor(fixture(),{outputTokens:0}),/positive/);
 const data=fixture(['X'.repeat(510000)],['Y'.repeat(510000)]);assert.throws(()=>planFor(data),/context budget/);
});
test('approval gate and an untrusted clone never invoke the transport',async()=>{
 const plan=planFor();let calls=0;const callModel=async()=>{calls++;};
 for(const approved of [null,{...approval(plan),planId:'wrong'},{...approval(plan),requestCount:999},{...approval(plan),maxUsd:0}])await assert.rejects(executeEventComparison({plan,approval:approved,callModel}),/approval/);
 await assert.rejects(executeEventComparison({plan:structuredClone(plan),approval:approval(plan),callModel}),/fresh/);assert.equal(calls,0);
});
test('invalid JSON, fences and truncated responses retain raw audit and usage as failures',async()=>{
 const plan=planFor();for(const msg of [message({}, {content:[{type:'text',text:'{'}]}),message({}, {content:[{type:'text',text:'```json\n{}\n```'}]}),message(unrelated(plan.tasks[0].input),{stop_reason:'max_tokens'}),message({rows:[]})]){
  const result=await executeEventComparison({plan,approval:approval(plan),callModel:async()=>msg});assert.equal(result.status,'FAILED');assert.ok(result.tasks[0].rawText);assert.equal(result.usage.outputTokens,50);
 }
});
test('provider failure retains successful blocks and never retries',async()=>{
 const plan=planFor(fixture(),{eventsPerBlock:1});let calls=0;
 const result=await executeEventComparison({plan,approval:approval(plan),callModel:async(p,options)=>{assert.equal(options.maxRetries,0);if(++calls===1)throw new Error('Mock failure');return message(unrelated(JSON.parse(p.messages[0].content)));}});
 assert.equal(calls,4);assert.equal(result.status,'PARTIAL');assert.equal(result.coverage.accountedPairs,3);assert.equal(result.usage.estimatedUsd,null);
});
test('cancellation and timeouts stop hung mock calls without hiding unreviewed pairs',async()=>{
 const plan=planFor(fixture(),{eventsPerBlock:1,timeoutMs:10});let calls=0;const abort=new AbortController();abort.abort();
 const none=await executeEventComparison({plan,approval:approval(plan),signal:abort.signal,callModel:async()=>{calls++;}});assert.equal(none.status,'CANCELLED');assert.equal(calls,0);
 const controller=new AbortController();const cancelled=await executeEventComparison({plan,approval:approval(plan),signal:controller.signal,callModel:async()=>{calls++;queueMicrotask(()=>controller.abort());return new Promise(()=>{});}});
 assert.equal(cancelled.status,'CANCELLED');assert.equal(calls,1);assert.equal(cancelled.coverage.accountedPairs,0);
 const timer=setInterval(()=>{},1000);try{const timed=await executeEventComparison({plan,approval:approval(plan),callModel:async()=>new Promise(()=>{})});assert.equal(timed.status,'FAILED');}finally{clearInterval(timer);}
});
test('checkpoint failures halt later requests and callback mutation cannot change the audit',async()=>{
 const plan=planFor(fixture(),{eventsPerBlock:1});let calls=0;
 await assert.rejects(executeEventComparison({plan,approval:approval(plan),callModel:async p=>{calls++;return message(unrelated(JSON.parse(p.messages[0].content)));},onEvent:e=>{if(e.event==='checkpoint')throw new Error('Mock save failure.');}}),error=>Boolean(error.comparisonResult));assert.equal(calls,1);
 const result=await executeEventComparison({plan,approval:approval(plan),callModel:async p=>message(related(JSON.parse(p.messages[0].content))),onEvent:e=>{if(e.event==='checkpoint')e.result.comparisons.length=0;}});
 assert.equal(result.comparisons.length,4);
});
test('all three AI categories remain model judgments and never generate numeric confidence',async()=>{
 for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE']){
  const result=await run(planFor(),input=>related(input,{type}));assert.ok(result.comparisons.every(c=>c.type===type));
  for(const c of result.comparisons){for(const key of ['score','confidence','humanConfidence','evidenceScore','evidenceStatus'])assert.equal(key in c,false);}
 }
});
test('empty extracted events expose zero reviewed pairs rather than proving clean testimony',async()=>{
 const data=fixture();data.extractionResult.documents[0].events=[];data.extractionResult.documents[0].coverage.segments[0].eventIds=[];const plan=planFor(data),result=await run(plan);
 assert.equal(plan.requestCount,0);assert.equal(result.coverage.plannedPairs,0);assert.equal(result.findings.length,0);assert.match(previewEventComparisonPlan(plan).notice,/Empty extraction can conceal/);
});
test('source records and response objects remain unchanged',()=>{
 const data=fixture(),before=structuredClone(data.extractionResult),plan=planFor(data);assert.deepEqual(data.extractionResult,before);
 const response=related(plan.tasks[0].input),copy=structuredClone(response);validateComparisonResponse(response,plan.tasks[0]);assert.deepEqual(response,copy);
 assert.throws(()=>parseComparisonMessage({stop_reason:'end_turn',content:[{type:'text',text:'null'}]}));
});

test('same quotations with different event interpretations are not merged into one finding',async()=>{
 const data=fixture(['A statement.'],['Other statement.']),doc=data.extractionResult.documents[0],copy=structuredClone(doc.events[0]);
 copy.id='another';copy.summary='A different proposed scope.';copy.sources[0].id='another-source';copy.assertion.sourceIds=['another-source'];copy.attributes[0].sourceIds=['another-source'];doc.events.push(copy);doc.coverage.segments[0].eventIds.push(copy.id);
 const result=await run(planFor(data));assert.equal(result.comparisons.length,2);assert.notEqual(result.comparisons[0].id,result.comparisons[1].id);
});
test('exact duplicate assessments retain all variants; conflicting labels are flagged rather than averaged',async()=>{
 const plan=planFor(fixture(['Left.'],['Right.']));
 const result=await run(plan,input=>{const r=related(input),c=r.rows[0].pairs[0].comparisons[0];r.rows[0].pairs[0].comparisons.push({...c,reasoning:'Another wording.'},{...c,type:'INFERENTIAL'});return r;});
 assert.equal(result.comparisons.length,2);assert.equal(result.comparisons.find(c=>c.type==='DIRECT').variants.length,2);
 assert.ok(result.comparisons.every(c=>c.typeDisagreement&&c.reviewRequired));
});
test('conflicting standalone-card decisions stay visible in merged variants',async()=>{
 const plan=planFor(fixture(['Left.'],['Right.']));
 const result=await run(plan,input=>{const r=related(input);r.rows[0].pairs[0].comparisons.push({...r.rows[0].pairs[0].comparisons[0],report:false});return r;});
 assert.equal(result.comparisons.length,1);assert.equal(result.comparisons[0].reportDisagreement,true);assert.equal(result.comparisons[0].variants.length,2);assert.equal(result.comparisons[0].reviewRequired,true);
});
test('opposite-document-only source IDs and question-only support are rejected',async()=>{
 const data=fixture(['Left.'],['Right.']),right=data.extractionResult.documents[1].events[0];right.sources[0].id='right-source';right.assertion.sourceIds=['right-source'];right.attributes[0].sourceIds=['right-source'];
 const result=await run(planFor(data),input=>related(input,{leftSourceIds:['right-source']}));assert.equal(result.comparisons.length,0);assert.equal(result.status,'FAILED');
 const qData=fixture(['Left.'],['Right.']),source=qData.extractionPlan.documents[0],e=qData.extractionResult.documents[0].events[0],quote='Tell me about item 0.';
 e.sources.push({id:'question',role:'QUESTION',quote,start:source.text.indexOf(quote),end:source.text.indexOf(quote)+quote.length,pageRefs:[]});
 const questions=await run(planFor(qData),input=>related(input,{leftSourceIds:['question']}));assert.equal(questions.comparisons.length,0);
});
test('different occasions retain their separate full question contexts',()=>{
 const data=fixture(['I attended.','I attended.'],['I did not attend.']);
 const plan=planFor(data);assert.equal(plan.catalogs[0].length,2);
 const contexts=plan.tasks[0].input.left.contexts;assert.equal(contexts.length,2);assert.notEqual(contexts[0].question.text,contexts[1].question.text);
});
test('missing or unpriced cached usage never becomes a fabricated cost',async()=>{
 for(const usage of [undefined,{input_tokens:100},{input_tokens:-1,output_tokens:50},{input_tokens:100,output_tokens:50,cache_read_input_tokens:20}]){
  const result=await run(planFor(),unrelated,{usage});assert.equal(result.usage.estimatedUsd,null);
 }
});

test('partial unrelated coverage is partial progress, not a pass or an erased result',async()=>{
 const result=await run(planFor(),input=>{const r=unrelated(input);r.rows.pop();return r;});
 assert.equal(result.status,'PARTIAL');assert.equal(result.coverage.accountedPairs,2);assert.equal(result.coverage.completedRequests,0);
});
test('225-page sources compare every extracted event across all blocks and keep original pages',async()=>{
 const data=fixture(Array.from({length:225},(_,i)=>`First document item ${i}.`),Array.from({length:225},(_,i)=>`Second document item ${i}.`));
 const inputs=data.extractionPlan.documents.map(d=>{
  let at=0;const pages=d.text.split('\n\n').map((text,i)=>{const p={pdfPage:i+1,pageLabel:String(1000+i),start:at,end:at+text.length,status:'TEXT'};at=p.end+2;return p;});
  return {documentId:d.documentId,text:d.text,extraction:{textSha256:hash(d.text),textLength:d.text.length,pageCount:pages.length,pages}};
 });
 data.extractionPlan=buildEventExtractionPlan(inputs);data.extractionResult.planId=data.extractionPlan.id;
 for(const [i,doc] of data.extractionResult.documents.entries())for(const event of doc.events)for(const source of event.sources)source.pageRefs=inputs[i].extraction.pages.filter(p=>p.end>source.start&&p.start<source.end).map(p=>({pdfPage:p.pdfPage,pageLabel:p.pageLabel}));
 const plan=planFor(data),result=await run(plan,input=>{
  const r=unrelated(input),left=input.left.records.find(l=>l.event.id==='e224'),right=input.right.records.find(r=>r.event.id==='e0');
  if(left&&right){const row=r.rows.find(r=>r.leftId===left.id);row.pairs=[{rightId:right.id,relation:'RELATED',reason:'Scripted distant pair.',comparisons:[comparison(left,right)]}];row.unrelatedRanges=input.right.records.length>1?[{start:1,end:input.right.records.length,reason:'Mock unrelated remainder.'}]:[];}
  return r;
 });
 assert.equal(result.status,'COMPLETE');assert.equal(result.coverage.plannedPairs,50625);assert.equal(result.coverage.accountedPairs,50625);assert.equal(result.findings.length,1);
 assert.equal(result.findings[0].leftSources[0].pageRefs[0].pdfPage,225);assert.equal(result.findings[0].rightSources[0].pageRefs[0].pdfPage,1);
 assert.equal(result.catalogs[0].length,225);assert.equal(result.catalogs[1].length,225);
});

test('upstream range/event bookkeeping cannot silently omit or invent extracted records',()=>{
 for(const mutate of [d=>{d.coverage.segments[0].eventIds=[];},d=>{d.coverage.segments[0].eventIds.push('invented');},d=>{d.coverage.status='FAILED';}]){
  const data=fixture();mutate(data.extractionResult.documents[0]);assert.throws(()=>planFor(data),/coverage|core range/);
 }
});

test('actual Part 3 mocked output feeds Part 4 without manual record rewriting',async()=>{
 const data=fixture(),extractionPlan=data.extractionPlan;
 const extractionResult=await executeEventExtraction({plan:extractionPlan,approval:approval(extractionPlan),callModel:async params=>{
  const input=JSON.parse(params.messages[0].content),units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);
  const events=units.map((s,i)=>({id:`event-${i}`,kind:'generic_assertion',summary:'Mock proposed assertion.',assertion:{polarity:'AFFIRMED',sourceIds:['a']},attributes:[],qualifiers:[],relations:[],sources:[{id:'a',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]}));
  return message({schemaVersion:1,events,units:units.map((u,i)=>({unitId:u.id,status:'EVENTS',eventIds:[events[i].id],reason:null}))});
 }});
 assert.equal(extractionResult.status,'COMPLETE');
 const plan=planFor({extractionPlan,extractionResult}),result=await run(plan);
 assert.equal(result.status,'COMPLETE');assert.equal(result.coverage.accountedPairs,4);assert.equal(result.comparisons.length,4);
 assert.equal(result.coverage.extractionPlanId,extractionPlan.id);
 assert.ok(result.provenance.pipelineSha256.match(/^[a-f0-9]{64}$/));
});
