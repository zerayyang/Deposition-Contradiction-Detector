import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan} from '../../server/events/extract.js';
import {buildEventComparisonPlan} from '../../server/events/compare.js';

// Fictional sentences only. Real testimony needed several minutes per request and a
// 64x60-event comparison block timed out, so defaults now allow longer requests and
// smaller comparison blocks. No source text is shortened or dropped.
const hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(leftCount,rightCount){
 const sides=[leftCount,rightCount].map((count,i)=>Array.from({length:count},(_,n)=>`I visited site ${i}-${n}.`));
 const sources=sides.map((sentences,i)=>({documentId:`fictional-${i}`,text:sentences.map((s,n)=>`Q: Tell me about item ${n}.\nA: ${s}`).join('\n\n')}));
 const extractionPlan=buildEventExtractionPlan(sources);
 const documents=sources.map((source,i)=>({documentId:source.documentId,documentSha256:hash(source.text),events:sides[i].map((quote,n)=>{
  const start=source.text.indexOf(quote);
  return {id:`e${n}`,kind:'visit',summary:`Proposed record ${n}`,assertion:{polarity:'AFFIRMED',sourceIds:[`s${n}`]},
   attributes:[{name:'activity',state:'STATED',value:quote,basis:'WITNESS_WORDS',sourceIds:[`s${n}`]}],qualifiers:[],relations:[],
   sources:[{id:`s${n}`,role:'WITNESS',quote,start,end:start+quote.length,pageRefs:[]}],reviewRequired:false,unresolvedReasons:[]};}),
  coverage:{status:'COMPLETE',segments:[{start:0,end:source.text.length,status:'PROCESSED',eventIds:sides[i].map((_,n)=>`e${n}`),reason:null}]}}));
 return {extractionPlan,extractionResult:{planId:extractionPlan.id,status:'COMPLETE',documents}};
}

test('reading and comparison requests default to the server model timeout', () => {
  const data=fixture(2,2);
  assert.equal(data.extractionPlan.timeoutMs,600000);
  assert.equal(buildEventComparisonPlan(data,{sameWitnessConfirmed:true}).timeoutMs,600000);
});

test('comparison blocks hold at most 32 events per side, so a request stays near 1,000 pairs', () => {
  const plan=buildEventComparisonPlan(fixture(70,60),{sameWitnessConfirmed:true});
  assert.equal(plan.pairCount,70*60);
  assert.equal(plan.requestCount,3*2);
  assert.ok(plan.tasks.every(t=>t.pairCount<=32*32),JSON.stringify(plan.tasks.map(t=>t.pairCount)));
  assert.equal(plan.tasks.reduce((n,t)=>n+t.pairCount,0),70*60,'every pair is still assigned');
});

test('explicit block size and timeout options still override the defaults', () => {
  const plan=buildEventComparisonPlan(fixture(70,60),{sameWitnessConfirmed:true,eventsPerBlock:64,timeoutMs:120000});
  assert.equal(plan.requestCount,2*1);assert.equal(plan.timeoutMs,120000);
});

test('reading instructions require a review flag and reason for every uncertain record', () => {
  const prompt=fs.readFileSync(new URL('../../server/events/EXTRACTION_PROMPT.md',import.meta.url),'utf8');
  for(const condition of ['UNCERTAIN or UNKNOWN','AMBIGUOUS','UNRESOLVED','targetEventId null'])assert.ok(prompt.includes(condition),condition);
  assert.match(prompt,/set reviewRequired true and\s+give at least one specific unresolvedReasons entry/);
});
