import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const load=name=>fs.readFile(new URL(name,root),'utf8').then(JSON.parse);
test('outside-source drafts have required provenance, valid splits and distinct IDs',async()=>{
 const cases=await load('cases.json');assert.ok(cases.length>0);
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 for(const c of cases){
  for(const field of ['id','source','sourceUrl','license','label','labelBasis','transcript1','transcript2','quote1','quote2'])assert.ok(typeof c[field]==='string'&&c[field].trim(),`Required field missing: ${field}`);
  assert.ok(['DIRECT','INFERENTIAL','FALSE_POSITIVE','DEBATABLE'].includes(c.label));
  assert.equal(c.debatable,c.label==='DEBATABLE');assert.equal(c.reviewStatus,'draft');
  assert.ok(['tuning','heldout'].includes(c.split));assert.equal(new URL(c.sourceUrl).protocol,'https:');
  if(c.sourceFamily==='judicial-sham'){
   const p=c.provenance;assert.ok(p,'Missing provenance');assert.notEqual(p.hardCasePageRequirementSatisfied,false);
   for(const keys of [['quote1OpinionPages','opinionQuote1Page'],['quote2OpinionPages','opinionQuote2Page'],['rulingOpinionPages','opinionRulingPage']])assert.ok(keys.some(k=>p[k]&&JSON.stringify(p[k])!=='[]'&&!JSON.stringify(p[k]).includes('NOT_VERIFIED')),'Missing verified quotation/ruling pinpoint');
  }
  assert.ok(c.notes);assert.ok(/(?:^|\n)Q[.:]/.test(c.transcript1),'Transcript 1 lacks a question role marker');assert.ok(/(?:^|\n)A[.:]/.test(c.transcript1),'Transcript 1 lacks an answer role marker');
  assert.ok(/(?:^|\n)Q[.:]/.test(c.transcript2),'Transcript 2 lacks a question role marker');assert.ok(/(?:^|\n)A[.:]/.test(c.transcript2),'Transcript 2 lacks an answer role marker');
 }
});
test('runner input artifact contains no answer keys or reference findings',async()=>{
 const cases=await load('cases.json'),inputs=await load('inputs.json'),refs=await load('reference-findings.json');
 assert.equal(inputs.length,cases.length);assert.equal(refs.length,cases.length);
 for(const input of inputs){
  assert.deepEqual(Object.keys(input).sort(),['id','split','transcript1','transcript2']);
  const c=cases.find(c=>c.id===input.id);assert.ok(c);
  assert.ok(input.transcript1===c.transcript1,'Transcript 1 differs from authored input');assert.ok(input.transcript2===c.transcript2,'Transcript 2 differs from authored input');
  const ref=refs.find(c=>c.id===input.id);assert.ok(ref);assert.ok(!('transcript1'in ref));assert.ok(!('transcript2'in ref));
 }
});
test('originating source documents do not cross tuning and heldout',async()=>{
 const cases=await load('cases.json'),splits=new Map();
 for(const c of cases){const key=c.splitGroup;if(splits.has(key))assert.equal(c.split,splits.get(key),'An originating opinion/proceeding or dataset document crosses splits');else splits.set(key,c.split);}
 assert.ok(cases.some(c=>c.split==='tuning'));assert.ok(cases.some(c=>c.split==='heldout'));
});
