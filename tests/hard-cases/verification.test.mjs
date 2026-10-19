import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {reviewableSpeakerLabels} from '../../server/sourceRoles.js';
const root=new URL('./',import.meta.url);
const load=name=>fs.readFile(new URL(name,root),'utf8').then(JSON.parse);
test('every active hard case has an affirmative independent source-review record',async()=>{
 for(const c of await load('cases.json')){
  assert.equal(c.provenance.independentVerification.keep,true,'Unverified case remains active');
 }
});
test('hard-case testimony yields framed witness answers without unknown speaker turns',async()=>{
 for(const c of await load('inputs.json'))for(const text of [c.transcript1,c.transcript2]){
  const index=parseTestimonySource(text),roles=reviewableSpeakerLabels(text);
  assert.equal(index.mode,'LABELED');assert.equal(roles.requiresWitnessConfirmation,false);
  assert.equal(roles.labels.length,0,'Unexpected named speaker role requires review');
  assert.ok(index.turns.some(t=>t.role==='WITNESS'),'No witness answer');
  assert.ok(index.turns.filter(t=>t.role==='WITNESS').every(t=>t.question),'Witness answer lacks governing question');
  assert.ok(index.turns.every(t=>['QUESTION','WITNESS'].includes(t.role)),'Unattributed/other text remains');
 }
});
test('production prompts contain no full answer-key sentences or corpus case IDs',async()=>{
 const audit=await load('verification/prompt-separation.json'),cases=await load('cases.json');
 for(const file of audit.files){
  const text=await fs.readFile(new URL('../../'+file.path,root),'utf8');
  for(const c of cases){
   assert.ok(!text.includes(c.id),'Corpus case ID leaked into a production prompt');
   for(const value of [c.labelBasis,c.provenance?.ruling,c.provenance?.rulingQuote])if(typeof value==='string'&&value.length>=30)assert.ok(!text.includes(value),'Answer-key sentence leaked into a production prompt');
  }
 }
});
