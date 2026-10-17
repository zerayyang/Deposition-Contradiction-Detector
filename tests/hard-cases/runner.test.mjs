import test from 'node:test';
import assert from 'node:assert/strict';
import {optionsFor,prepareCases,executeCases,cappedTransport} from './run.mjs';
const cases=[{id:'synthetic-only',split:'heldout',transcript1:'Q: What did you sign?\nA: A synthetic form.',transcript2:'Q: What did you sign?\nA: A synthetic notice.',label:'ANSWER_KEY_SENTINEL',labelBasis:'JUDICIAL_REFERENCE_SENTINEL',notes:'REFERENCE_NOT_INPUT'}];
test('preview defaults to no approval and validates method, split, repeats and spending cap',()=>{
 assert.equal(optionsFor([]).approveUsd,null);
 assert.deepEqual(optionsFor(['--method','events','--split=heldout','--repeat=2']),{method:'events',split:'heldout',repeat:2,approveUsd:null,skipDatasets:false});
 for(const args of [['--approve-usd=NaN'],['--approve-usd=0'],['--approve-usd=-1'],['--approve-usd=Infinity'],['--method=other'],['--repeat=0'],['--split=other'],['--unknown'],['--method']])assert.throws(()=>optionsFor(args));
});
test('direct preview uses application plans, excludes answer keys and repeats counts without transport',async()=>{
 const options=optionsFor(['--repeat=2']),prepared=await prepareCases(cases,options);
 assert.equal(prepared.preview.mode,'COST PREVIEW ONLY');assert.equal(prepared.preview.plannedRequests,2);
 const planned=JSON.stringify(prepared.jobs);
 for(const marker of ['ANSWER_KEY_SENTINEL','JUDICIAL_REFERENCE_SENTINEL','REFERENCE_NOT_INPUT'])assert.ok(!planned.includes(marker));
 let calls=0;await assert.rejects(()=>executeCases(prepared,options,async()=>{calls++;}),/--approve-usd/);assert.equal(calls,0);
});
test('events preview explicitly leaves comparison count and total price unknown',async()=>{
 const options=optionsFor(['--method=events','--split=heldout']),prepared=await prepareCases(cases,options);
 assert.equal(prepared.preview.plannedRequests,2);assert.equal(prepared.preview.phase,'extraction only');
 assert.match(prepared.preview.completeWorkflowCost,/UNKNOWN/);assert.match(prepared.preview.comparisonRequests,/UNKNOWN/);
 assert.ok(!JSON.stringify(prepared.jobs).includes('ANSWER_KEY_SENTINEL'));
});
test('empty selection and insufficient phase cap refuse before any transport call',async()=>{
 await assert.rejects(()=>prepareCases(cases,optionsFor(['--split=tuning'])),/No cases/);
 const options=optionsFor(['--approve-usd=0.000001']),prepared=await prepareCases(cases,options);let calls=0;
 await assert.rejects(()=>executeCases(prepared,options,async()=>{calls++;}),/below/);assert.equal(calls,0);
});
test('budget transport fails closed before an over-cap or unpriced request',async()=>{
 let calls=0;const transport=cappedTransport(async()=>{calls++;},0.01,{model:{id:'synthetic',inputUsdPerMillion:4,outputUsdPerMillion:20}});
 await assert.rejects(()=>transport.call({model:'synthetic',max_tokens:1000},{}),{code:'BUDGET_EXHAUSTED'});
 await assert.rejects(()=>transport.call({model:'other',max_tokens:1},{}),{code:'BUDGET_EXHAUSTED'});
 assert.equal(calls,0);assert.equal(transport.reservedUsd,0);
});
test('failed requests keep their reservation and disable retries',async()=>{
 let calls=0;const transport=cappedTransport(async(_params,options)=>{calls++;assert.equal(options.maxRetries,0);throw new Error('Synthetic transport failure.');},1,{model:{id:'synthetic',inputUsdPerMillion:4,outputUsdPerMillion:20}});
 await assert.rejects(()=>transport.call({model:'synthetic',max_tokens:1000},{}),/Synthetic/);
 assert.equal(calls,1);assert.equal(transport.calls,1);assert.ok(transport.reservedUsd>0);
});
test('mocked event reading with a quarantined note never acknowledges gaps or starts comparison',async()=>{
 const options=optionsFor(['--method=events','--approve-usd=100']),prepared=await prepareCases(cases,options);let calls=0;
 const result=await executeCases(prepared,options,async params=>{
  const input=JSON.parse(params.messages[0].content);assert.ok(Array.isArray(input.sources),'Only extraction should run');
  for(const marker of ['ANSWER_KEY_SENTINEL','JUDICIAL_REFERENCE_SENTINEL','REFERENCE_NOT_INPUT'])assert.ok(!JSON.stringify(params).includes(marker));
  const units=input.sources.filter(s=>s.role==='WITNESS'&&s.assigned);
  const events=units.map((u,i)=>({id:'e'+i,kind:'synthetic',summary:'Synthetic note.',assertion:{polarity:'AFFIRMED',sourceIds:['w']},attributes:[],qualifiers:[],relations:[],sources:[{id:'w',unitId:u.id,quote:calls===0?'Absent synthetic quotation.':u.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]}));
  calls++;
  return {stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({schemaVersion:1,events,units:units.map((u,i)=>({unitId:u.id,status:'EVENTS',eventIds:['e'+i],reason:null}))})}],usage:{input_tokens:20,output_tokens:20}};
 });
 assert.equal(calls,2);assert.equal(result.requests,2);assert.equal(result.summaries.length,1);
 assert.equal(result.summaries[0].phase,'extraction');assert.notEqual(result.summaries[0].status,'awaiting_comparison');
});
test('a response with usage settles its reservation to measured cost',async()=>{
 const model={id:'synthetic',inputUsdPerMillion:4,outputUsdPerMillion:20};
 const transport=cappedTransport(async()=>({usage:{input_tokens:1000,output_tokens:1000}}),1,{model});
 await transport.call({model:'synthetic',max_tokens:10000},{});
 assert.equal(transport.reservedUsd,0.024);
 const unknown=cappedTransport(async()=>({}),1,{model});await unknown.call({model:'synthetic',max_tokens:10000},{});
 assert.ok(unknown.reservedUsd>0.2,'Missing usage keeps the full ceiling');
});
test('a billing or permission refusal stops the run instead of trying every case',async()=>{
 const transport=cappedTransport(async()=>{throw Object.assign(new Error('refused'),{status:400});},1,{model:{id:'synthetic',inputUsdPerMillion:4,outputUsdPerMillion:20}});
 await assert.rejects(()=>transport.call({model:'synthetic',max_tokens:10},{}),/refused/);
 assert.equal(transport.capReached,true);
 const other=cappedTransport(async()=>{throw Object.assign(new Error('timeout'),{status:529});},1,{model:{id:'synthetic',inputUsdPerMillion:4,outputUsdPerMillion:20}});
 await assert.rejects(()=>other.call({model:'synthetic',max_tokens:10},{}));assert.equal(other.capReached,false);
});
