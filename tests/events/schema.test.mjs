import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateEventBundle,documentDigest} from '../../server/events/validate.js';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures.json',import.meta.url),'utf8'));
const fixture=(id='presence-denial')=>structuredClone(fixtures.find(item=>item.id===id));
const checked=f=>validateEventBundle(f.bundle,{documentId:f.documentId,text:f.text,...(f.pages?{pages:f.pages}:{})});
const has=(result,code)=>result.errors.some(error=>error.code===code);
for(const original of fixtures)test(`fictional event record: ${original.id}`,()=>{
 const f=structuredClone(original),before=structuredClone(f.bundle),result=checked(f);
 assert.equal(result.valid,true,JSON.stringify(result.errors));assert.deepEqual(f.bundle,before);
 assert.equal(result.coverage.processedCharacters,f.text.length);assert.match(result.notice,/does not prove/);
});
test('missing source input, wrong document ID and changed text fail explicitly',()=>{
 const f=fixture();assert.ok(has(validateEventBundle(f.bundle),'SOURCE_REQUIRED'));
 assert.ok(has(validateEventBundle(f.bundle,{documentId:'other',text:f.text}),'DOCUMENT_MISMATCH'));
 assert.ok(has(validateEventBundle(f.bundle,{documentId:f.documentId,text:f.text+'!'}),'DOCUMENT_CHANGED'));
});
test('additional model scores are rejected without removing or fixing them',()=>{
 for(const mutate of [b=>{b.score=90;},b=>{b.events[0].confidence=0.9;},b=>{b.events[0].assertion.probability=1;}]){
  const f=fixture();mutate(f.bundle);const before=structuredClone(f.bundle);assert.ok(has(checked(f),'SCHEMA'));assert.deepEqual(f.bundle,before);
 }
 const f=fixture();f.bundle.events[0].attributes.push({name:'human_confidence',state:'UNSTATED',value:null,basis:'NONE',sourceIds:[]});assert.ok(has(checked(f),'MODEL_SCORE_FORBIDDEN'));
});
test('numeric quantities must remain literal text, not coerced numbers',()=>{
 const f=fixture('approximate-quantity');f.bundle.events[0].attributes.find(a=>a.name==='quantity').value=12;assert.ok(has(checked(f),'SCHEMA'));
});
test('unknown is not false, empty string or an invented value',()=>{
 for(const value of [false,'', 'Nobody']){
  const f=fixture();f.bundle.events[0].attributes.find(a=>a.name==='other_people').value=value;assert.equal(checked(f).valid,false);
 }
 const f=fixture();f.bundle.events[0].attributes.find(a=>a.name==='other_people').sourceIds=['e1-a'];assert.ok(has(checked(f),'UNSTATED_HAS_SOURCE'));
});
test('literal fields must be inside the referenced source of the declared basis',()=>{
 const f=fixture();f.bundle.events[0].attributes[0].value='the Harbor Cafe';assert.ok(has(checked(f),'FIELD_NOT_LITERAL'));
 const g=fixture();g.bundle.events[0].attributes[0].basis='WITNESS_WORDS';assert.ok(has(checked(g),'FIELD_NOT_LITERAL'));
});
test('changed punctuation, stitched quotations and wrong source offsets are rejected',()=>{
 for(const mutate of [s=>{s.quote=s.quote.replace('.', '!');},s=>{s.quote+=' Added words.';},s=>{s.start++;}]){
  const f=fixture();mutate(f.bundle.events[0].sources[1]);assert.ok(has(checked(f),'QUOTE_MISMATCH'));
 }
});
test('exact repeated answers must use the question governing the selected occurrence',()=>{
 const f=fixture('repeated-answer'),q=f.bundle.events[0].sources[0];q.quote='Did you attend in 2020?';q.start=f.text.indexOf(q.quote);q.end=q.start+q.quote.length;
 assert.ok(has(checked(f),'QUESTION_NOT_GOVERNING'));
});
test('counsel and court speech cannot be relabeled as witness support',()=>{
 const f=fixture('repeated-answer');f.text='Q: Did you attend in 2021?\nTHE COURT: Yes.';f.bundle.documentSha256=documentDigest(f.text);
 for(const source of f.bundle.events[0].sources){source.start=f.text.indexOf(source.quote);source.end=source.start+source.quote.length;}
 f.bundle.coverage.segments[0].end=f.text.length;assert.ok(has(checked(f),'SOURCE_ROLE'));
});
test('question text alone cannot assert an event',()=>{
 const f=fixture();f.bundle.events[0].assertion.sourceIds=['e1-q'];assert.ok(has(checked(f),'WITNESS_SUPPORT_REQUIRED'));
});
test('unknown source IDs and duplicate event/source IDs are visible errors',()=>{
 const f=fixture();f.bundle.events[0].assertion.sourceIds=['invented'];assert.ok(has(checked(f),'UNKNOWN_SOURCE'));
 const g=fixture();g.bundle.events.push(structuredClone(g.bundle.events[0]));assert.ok(has(checked(g),'DUPLICATE_ID'));assert.equal(checked(g).eventResults.length,2);
});
test('unresolved interpretations require explicit review and a reason',()=>{
 const f=fixture('ambiguous-person');f.bundle.events[0].reviewRequired=false;assert.ok(has(checked(f),'REVIEW_REQUIRED'));
 const g=fixture('signing-uncertain');g.bundle.events[0].unresolvedReasons=[];assert.ok(has(checked(g),'REVIEW_REQUIRED'));
});
test('qualifiers remain literal and link only to existing attributes',()=>{
 const f=fixture('approximate-time');f.bundle.events[0].qualifiers[0].phrase='exactly';assert.ok(has(checked(f),'QUALIFIER_NOT_LITERAL'));
 const g=fixture('approximate-time');g.bundle.events[0].qualifiers[0].attributeNames=['invented'];assert.ok(has(checked(g),'UNKNOWN_ATTRIBUTE'));
});
test('correction links preserve the old event and reject missing/self targets',()=>{
 const f=fixture('explicit-correction');assert.equal(checked(f).eventResults.length,2);
 for(const target of ['missing','e2']){const g=fixture('explicit-correction');g.bundle.events[1].relations[0].targetEventId=target;assert.ok(has(checked(g),'INVALID_RELATION'));assert.equal(checked(g).eventResults[1].valid,false);}
});
test('coverage gaps, overlaps and unaccounted tails cannot report complete',()=>{
 const f=fixture();f.bundle.coverage.segments[0].start=1;assert.ok(has(checked(f),'COVERAGE_GAP_OR_OVERLAP'));
 const g=fixture();g.bundle.coverage.segments[0].end--;assert.ok(has(checked(g),'INCOMPLETE_ACCOUNTING'));
 const h=fixture();h.bundle.coverage.segments.push({...h.bundle.coverage.segments[0]});assert.ok(has(checked(h),'COVERAGE_GAP_OR_OVERLAP'));
});
test('failed ranges remain accounted and empty results do not claim event recall',()=>{
 const f=fixture();f.bundle.events=[];f.bundle.coverage={status:'FAILED',segments:[{start:0,end:f.text.length,status:'FAILED',eventIds:[],reason:'Mock extraction unavailable.'}]};
 assert.equal(checked(f).valid,true);assert.equal(checked(f).coverage.unprocessedCharacters,f.text.length);
 f.bundle.coverage.status='COMPLETE';assert.ok(has(checked(f),'COVERAGE_STATUS'));
 const g=fixture();g.bundle.events=[];g.bundle.coverage.segments[0].eventIds=[];const result=checked(g);assert.equal(result.valid,true);assert.match(result.notice,/exhaustive event recall/);
});
test('partial extraction explicitly accounts for processed and unprocessed ranges',()=>{
 const f=fixture();f.bundle.events=[];const cut=Math.floor(f.text.length/2);
 f.bundle.coverage={status:'PARTIAL',segments:[{start:0,end:cut,status:'PROCESSED',eventIds:[],reason:null},{start:cut,end:f.text.length,status:'UNPROCESSED',eventIds:[],reason:'Not attempted.'}]};
 assert.equal(checked(f).valid,true);f.bundle.coverage.segments[1].reason=null;assert.ok(has(checked(f),'FAILURE_REASON_REQUIRED'));
});
test('event sources must be covered by a processed range listing that event',()=>{
 const f=fixture();f.bundle.coverage.segments[0].eventIds=[];assert.ok(has(checked(f),'SOURCE_OUTSIDE_PROCESSED_RANGE'));
 const g=fixture();g.bundle.coverage.segments[0].eventIds=['missing'];assert.ok(has(checked(g),'UNKNOWN_EVENT'));
});
test('page references require a supplied map and must match that map',()=>{
 const f=fixture();f.bundle.events[0].sources[0].pageRefs=[{pdfPage:4,pageLabel:'17'}];assert.ok(has(checked(f),'PAGE_MAP_REQUIRED'));
 const g=fixture();g.pages=[{pdfPage:1,pageLabel:'17',start:0,end:g.text.length}];for(const source of g.bundle.events[0].sources)source.pageRefs=[{pdfPage:1,pageLabel:'17'}];assert.equal(checked(g).valid,true);
 g.bundle.events[0].sources[0].pageRefs[0].pdfPage=2;assert.ok(has(checked(g),'PAGE_MISMATCH'));
});
test('UTF-16 source offsets remain exact around supplementary Unicode characters',()=>{
 const f=fixture(),prefix='Note: \u{1F4C4}\n';f.text=prefix+f.text;f.bundle.documentSha256=documentDigest(f.text);
 for(const source of f.bundle.events[0].sources){source.start+=prefix.length;source.end+=prefix.length;}
 f.bundle.coverage.segments[0].end=f.text.length;assert.equal(checked(f).valid,true);
});
test('source validation does not pretend to verify semantic interpretation',()=>{
 const f=fixture();f.bundle.events[0].assertion.polarity='AFFIRMED';const result=checked(f);
 assert.equal(result.valid,true);assert.match(result.notice,/does not prove semantic labels/);
});

test('invalid document provenance invalidates each event, and broken coverage has no misleading counts',()=>{
 const f=fixture();f.bundle.documentSha256='0'.repeat(64);assert.ok(checked(f).eventResults.every(event=>event.valid===false));
 const g=fixture();g.bundle.coverage.segments.push({...g.bundle.coverage.segments[0]});const result=checked(g);assert.equal(result.coverage.status,'INVALID');assert.equal(result.coverage.processedCharacters,null);assert.equal(result.coverage.accountingValid,false);
});
