import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';
import {scoreEventComparisons} from '../../server/events/scoringAdapter.js';
import {literalActivityPhrase} from '../../server/scoring/rules.js';
import {readFileSync} from 'node:fs';
// Fictional transport fixtures, independent of author/verifier gold. No live calls.
const input={workflow:'events-v1',phase:'extract',caseId:'fictional',sameWitnessConfirmed:true,speakerRoles:[{},{}],transcript1:'Q: Where were you on Friday evening?\nA: I stayed home all evening.',transcript2:'Q: Where were you on Friday evening?\nA: I left home at 7 pm.'};
const msg=v=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(v)}],usage:{input_tokens:0,output_tokens:0}});
async function extracted(){return executeEventWorkflow({prepared:await prepareEventWorkflow(input),body:input,callModel:async p=>{const v=JSON.parse(p.messages[0].content),units=v.sources.filter(s=>s.assigned&&s.role==='WITNESS');return msg({schemaVersion:1,events:units.map((s,n)=>({id:'e'+n,kind:'unfamiliar_open_kind',summary:'Scripted assertion with open attribute names.',assertion:{polarity:'AFFIRMED',sourceIds:['s']},attributes:[],qualifiers:[],relations:[],sources:[{id:'s',unitId:s.id,quote:s.text.trim(),occurrence:0}],reviewRequired:false,unresolvedReasons:[]})),units:units.map((s,n)=>({unitId:s.id,status:'EVENTS',eventIds:['e'+n],reason:null}))});}});}
async function compare(extraction,type,missingContext=[],sameWitnessConfirmed=true){const body={...input,phase:'compare',sameWitnessConfirmed,eventState:extraction.analysis.eventState},prepared=await prepareEventWorkflow(body);return executeEventWorkflow({prepared,body,callModel:async p=>{const v=JSON.parse(p.messages[0].content);return msg({schemaVersion:1,rows:v.left.records.map(l=>({leftId:l.id,pairs:v.right.records.map(r=>({rightId:r.id,relation:'RELATED',reason:'Scripted source-established Friday evening.',comparisons:[{issue:'Presence',type,report:true,reasoning:'Scripted classification independent of code score.',leftSourceIds:[l.event.sources[0].id],rightSourceIds:[r.event.sources[0].id],missingContext}]})),unrelatedRanges:[]}))});}});}
test('source-derived rules still work with open event kinds and no fixed attribute vocabulary',async()=>{
 const extraction=await extracted();
 for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE']){const result=await compare(extraction,type);const f=result.contradictions[0];assert.equal(f.status,'CONFLICT_SUPPORTED');assert.equal(f.score,90);assert.equal(f.claim1Valid,true);assert.equal(f.claim2Valid,true);}
});
test('genuine declared identity/scope uncertainty remains unresolved; no auto-clearing of model context fields',async()=>{
 const extraction=await extracted(),result=await compare(extraction,'INFERENTIAL',['The two statements may concern different occasions.']);
 assert.equal(result.contradictions[0].score,null);assert.equal(result.contradictions[0].status,'NOT_EVALUABLE');
 const unknown=await compare(extraction,'DIRECT',[],false);assert.equal(unknown.contradictions[0].score,null);
});
test('instructions distinguish necessary context from optional follow-ups and preserve scope uncertainty',()=>{
 const text=readFileSync(new URL('../../server/events/COMPARISON_PROMPT.md',import.meta.url),'utf8');assert.match(text,/absent facts NECESSARY/);assert.match(text,/not a list of everything/);assert.match(text,/Never clear missingContext just to obtain a score/);
 const definitions=readFileSync(new URL('../../server/proper_prompts.md',import.meta.url),'utf8');assert.match(definitions,/universal or exhaustive assertion/);assert.match(definitions,/If scope membership instead requires a separate supported timeline/);assert.match(definitions,/No opposing assertion under the directness test/);assert.match(definitions,/Reading that exclusion is not an additional inferential step/);
});

test('literal activity fallback accepts supported complete assertions, not conditions, quotes or compound statements',()=>{
 for(const s of ['I never signed the first form during that meeting.','I signed the first form during that meeting.'])assert.equal(literalActivityPhrase(s),s);
 for(const s of ['I would sign the form.','I signed only the first form.','I signed the form if it was approved.','I said I signed the form.','I signed the form. I corrected that answer.','I signed and returned the form.','signed'])assert.equal(literalActivityPhrase(s),null,s);
});

test('open attributes supply activity only from a complete literal answer; cropped negation stays unscored',()=>{
 const a='I never signed the first form during that meeting.',b='I signed the first form during that meeting.';
 const texts=[`Q: Did you sign during the October 1, 2025 meeting?\nA: ${a}`,`Q: Did you sign during the October 1, 2025 meeting?\nA: ${b}`];
 for(const cropped of [false,true]){
  const quotes=[cropped?'signed the first form during that meeting.':a,b],sources=quotes.map((quote,i)=>({id:'s'+i,role:'WITNESS',quote,start:texts[i].indexOf(quote),end:texts[i].indexOf(quote)+quote.length,pageRefs:[]}));
  const events=sources.map((s,i)=>({id:'e'+i,kind:'unfamiliar_document_action',attributes:[{name:'document',state:'STATED',basis:'WITNESS_WORDS',value:'the first form',sourceIds:[s.id]}],qualifiers:[],relations:[],reviewRequired:false}));
  const comparisons={catalogs:events.map((event,i)=>[{id:'g'+i,event}]),comparisons:[{id:'comparison',type:'DIRECT',report:true,reviewRequired:false,issue:'Signing',variants:[{leftId:'g0',rightId:'g1',reasoning:'Scripted only.'}],leftSources:[sources[0]],rightSources:[sources[1]]}]};
  const [f]=scoreEventComparisons(comparisons,{documents:texts.map(text=>({text,speakerRoles:{}}))});
  assert.equal(f.claim1Valid,true);assert.equal(f.score,cropped?null:90);assert.equal(f.claim1.activityPhrase,cropped?null:a);
 }
});
