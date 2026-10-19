import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {reviewableSpeakerLabels} from '../../server/sourceRoles.js';
import {shingleCoverage} from './fidelity.mjs';
import {priorOverlap,canonicalUrl} from './identity.mjs';
const root=new URL('./',import.meta.url),load=name=>fs.readFile(new URL(name,root),'utf8').then(JSON.parse);
test('fresh held-out records have complete provenance and unique opaque identifiers',async()=>{
 const cases=await load('cases.json');assert.ok(cases.length>0);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 for(const c of cases){
  for(const key of ['id','source','sourceUrl','license','label','labelBasis','quote1','quote2','transcript1','transcript2'])assert.ok(typeof c[key]==='string'&&c[key].trim(),'Missing required field');
  assert.ok(/^fresh-[abc]-\d+$/.test(c.id),'Case identifier must remain opaque');
  assert.equal(c.split,'heldout');assert.equal(c.reviewStatus,'draft');assert.equal(c.debatable,c.label==='DEBATABLE');
  assert.ok(['DIRECT','FALSE_POSITIVE','INFERENTIAL','DEBATABLE'].includes(c.label));assert.equal(new URL(c.sourceUrl).protocol,'https:');assert.ok(c.notes);
  for(const key of ['quote1Page','quote2Page','rulingPage'])assert.ok(c.provenance[key]&&!/unverified|unknown|paragraph|html\s*¶/i.test(JSON.stringify(c.provenance[key])),'Opinion-page pinpoint is unavailable');
  assert.equal(c.provenance.quote1Verbatim,true);assert.equal(c.provenance.quote2Verbatim,true);
 }
});
test('new opinions are disjoint from the old corpus and limited to two cases each',async()=>{
 const cases=await load('cases.json'),index=await load('research/excluded-opinions.json'),counts=new Map();
 for(const c of cases){assert.equal(priorOverlap(c,index),false,'Old opinion/matter leaked into fresh set');const key=canonicalUrl(c.sourceUrl);counts.set(key,(counts.get(key)??0)+1);}
 assert.ok([...counts.values()].every(n=>n<=2),'Too many cases from one opinion');
});
test('source-backed quotations satisfy the fixed coverage policy',async()=>{
 for(const c of await load('cases.json')){
  const p=c.provenance;assert.ok(p.coverageSourceFile.startsWith('research/')&&!p.coverageSourceFile.includes('..'),'Invalid source-capture path');
  const source=await fs.readFile(new URL(p.coverageSourceFile,root),'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),p.coverageSourceSha256,'Source-capture hash mismatch');
  for(const quote of [c.quote1,c.quote2])assert.ok(shingleCoverage(quote,source)>=0.9,'Quote coverage below fixed threshold');
 }
});
test('detector inputs exclude keys and retain framed witness testimony',async()=>{
 const cases=await load('cases.json'),inputs=await load('inputs.json'),refs=await load('reference-findings.json');
 assert.equal(inputs.length,cases.length);assert.equal(refs.length,cases.length);
 for(const input of inputs){
  assert.deepEqual(Object.keys(input).sort(),['id','split','transcript1','transcript2']);const c=cases.find(c=>c.id===input.id),ref=refs.find(r=>r.id===input.id);assert.ok(c&&ref);
  assert.ok(!('transcript1'in ref)&&!('transcript2'in ref));
  for(const key of ['transcript1','transcript2']){
   assert.ok(input[key]===c[key],'Detector input differs from frozen authored testimony');
   const parsed=parseTestimonySource(input[key]),roles=reviewableSpeakerLabels(input[key]);
   assert.equal(parsed.mode,'LABELED');assert.equal(roles.labels.length,0,'Unknown named speaker turn');
   const witnesses=parsed.turns.filter(t=>t.role==='WITNESS');assert.ok(witnesses.length>0);assert.ok(witnesses.every(w=>w.question),'Unframed witness answer');
   assert.ok(parsed.turns.every(t=>['QUESTION','WITNESS'].includes(t.role)),'Non-Q/A source turn');
  }
 }
});
test('fresh answer-key sentences and IDs do not appear in production prompts',async()=>{
 const baseline=await load('research/baseline.json'),cases=await load('cases.json');
 // The baseline also lists the removed events-method prompts; only prompts that still ship are checked.
 for(const file of Object.keys(baseline.productionPrompts).filter(f=>!f.startsWith('server/events/'))){
  const text=await fs.readFile(new URL('../../'+file,root),'utf8');
  for(const c of cases){
   assert.ok(!text.includes(c.id),'Fresh case ID appears in production prompt');
   for(const value of [c.labelBasis,c.provenance.rulingQuote])if(typeof value==='string'&&value.length>=30)assert.ok(!text.includes(value),'Fresh answer-key sentence appears in production prompt');
  }
 }
});
