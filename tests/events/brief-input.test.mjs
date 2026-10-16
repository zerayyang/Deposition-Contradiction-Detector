import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {testimonyMarkers,checkedSpeakerRoles,documentLabel} from '../../server/testimonyMarkers.js';
import {reviewableSpeakerLabels} from '../../server/events/sourceRoles.js';
import {buildEventExtractionPlan} from '../../server/events/extract.js';import {buildPlan} from '../../server/documentAnalysis.js';
const brief=fs.readFileSync(new URL('./fixtures/sanitized-brief.txt',import.meta.url),'utf8');
test('brief footer and citation headings are OTHER metadata, never named witnesses',()=>{
 const markers=testimonyMarkers(brief),parsed=parseTestimonySource(brief);
 for(const label of ['SOURCE','CITATION','EXHIBIT','NOTE','FOOTNOTE','SEE','Dep.','Dep. 4']){
  assert.equal(documentLabel(label),true,label);assert.throws(()=>checkedSpeakerRoles({speakerRoles:{[label]:'WITNESS'}}));
 }
 assert.deepEqual(reviewableSpeakerLabels(brief).labels,[]);
 assert.ok(markers.filter(m=>m.roleOrigin==='DOCUMENT_LABEL').every(m=>m.role==='S'&&m.speaker===null));
 const witness=parsed.turns.filter(t=>t.role==='WITNESS');assert.equal(witness.length,1);
 assert.equal(brief.slice(witness[0].contentStart,witness[0].end).trim(),'I signed the sample form.');
 assert.equal(parsed.turns.map(t=>brief.slice(t.start,t.end)).join(''),brief);
 assert.ok(!parsed.diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'));
});
test('plain prose cannot start either workflow without explicit boolean testimony confirmation',()=>{
 const text='Synthetic witness account without labels.';
 assert.throws(()=>buildEventExtractionPlan([{documentId:'plain',text}]),/WITNESS_CONFIRMATION_REQUIRED/);
 assert.throws(()=>buildPlan([text,text],[],'Mock instructions.'),/WITNESS_CONFIRMATION_REQUIRED/);
 for(const value of ['true',1])assert.throws(()=>buildEventExtractionPlan([{documentId:'plain',text,witnessTestimonyConfirmed:value}]),/boolean/);
 const p=buildEventExtractionPlan([{documentId:'plain',text,witnessTestimonyConfirmed:true}]);assert.equal(p.requestCount,1);
 assert.equal(buildPlan([text,text],[],'Mock instructions.',{witnessTestimonyConfirmed:[true,true]}).requestCount,1);
 // Confirmation is not permission to classify footer metadata as testimony.
 assert.throws(()=>buildEventExtractionPlan([{documentId:'brief',text:'Source: Synthetic reference.',witnessTestimonyConfirmed:true}]),/no supported witness spans/);
});
test('quoted Q/A fixture keeps its exact source layout and does not need a footer speaker review',()=>{
 const p=buildEventExtractionPlan([{documentId:'brief',text:brief}]);assert.equal(p.requestCount,1);assert.equal(p.documents[0].text,brief);
 assert.ok(p.tasks[0].input.sources.every(s=>!s.text.includes('Source:')));
});
