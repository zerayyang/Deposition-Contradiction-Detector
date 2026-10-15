import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,executePlan,digest} from '../../server/documentAnalysis.js';
const claim=(original,extra={})=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[],...extra});
const candidate=(a,b)=>({type:'FALSE_POSITIVE',severity:'LOW',reasoning:'Mocked only; source location is under test.',claim1:a,claim2:b});
const message=contradictions=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({topicsReviewed:['roles'],contradictions})}],usage:{input_tokens:10,output_tokens:20}});
const document=pages=>{let offset=0;const manifest=pages.map((text,i)=>{if(i)offset+=2;const p={pdfPage:i+1,pageLabel:String(i+40),start:offset,end:offset+text.length,status:'TEXT'};offset=p.end;return p;});const text=pages.join('\n\n');return {text,metadata:{extraction:{textSha256:digest(text),textLength:text.length,pageCount:pages.length,pages:manifest}}};};
test('repeated answers with distinct literal anchors stay separate and show only their selected pages',async()=>{
 const first=document(['Q: Were you a director in 2016?\nA: Yes.\nTHE COURT: Yes.','Q: Were you a manager in 2017?\nA: Yes.']);
 const other='Q: Did you hold those roles?\nA: Probably.';
 const texts=[first.text,other];
 const cases=['Were you a director in 2016?','Were you a manager in 2017?'].map(q=>candidate(claim('Yes.',{sourceQuestion:q,sourceAnswer:'Yes.'}),claim('Probably.')));
 const result=await executePlan({plan:buildPlan(texts,[first.metadata],'rules'),texts,instructions:'rules',callModel:async()=>message(cases)});
 assert.equal(result.analysis.status,'complete');assert.equal(result.contradictions.length,2);
 for(const [i,f] of result.contradictions.entries()){
  assert.equal(f.sourceBindings.claim1.status,'BOUND');assert.equal(f.sourceReferences.claim1.length,1);
  assert.equal(f.sourceReferences.claim1[0].pdfPage,i+1);assert.equal(first.text.slice(f.sourceReferences.claim1[0].start,f.sourceReferences.claim1[0].end),'Yes.');
  assert.equal(f.score,null); // Correct location alone cannot invent a comparable fact.
 }
});
test('legacy ambiguity stays visible, counsel-only quote is unverified and no AI score can override it',async()=>{
 const text='Q: Did you sign?\nA: Yes.\nMR. LAWYER: I signed.\nQ: Did you read?\nA: Yes.',other='Q: Did you sign?\nA: No.';
 const cases=[candidate(claim('Yes.'),claim('No.')),candidate(claim('I signed.'),claim('No.'))];
 const result=await executePlan({plan:buildPlan([text,other],[],'rules'),texts:[text,other],instructions:'rules',callModel:async()=>message(cases.map(c=>({...c,score:100,humanConfidence:100})))});
 assert.equal(result.contradictions[0].sourceBindings.claim1.status,'AMBIGUOUS');assert.equal(result.contradictions[0].score,null);
 assert.equal(result.contradictions[1].claim1Valid,false);assert.equal(result.contradictions[1].humanConfidence,null);
 assert.equal(result.analysis.status,'partial');
});
test('one unique occurrence spanning two PDF pages remains one occurrence, not two alternatives',async()=>{
 const first=document(['Q: Explain your role.\nA: I supervised','the final review.\nQ: Finished?\nA: Yes.']),other='Q: What did you do?\nA: I reviewed it.';
 const c=candidate(claim('I supervised\n\nthe final review.',{sourceQuestion:'Explain your role.'}),claim('I reviewed it.'));
 const texts=[first.text,other],result=await executePlan({plan:buildPlan(texts,[first.metadata],'rules'),texts,instructions:'rules',callModel:async()=>message([c])});
 const f=result.contradictions[0];assert.equal(f.sourceBindings.claim1.status,'BOUND');assert.equal(f.sourceReferences.claim1.length,2);
 assert.equal(new Set(f.sourceReferences.claim1.map(ref=>ref.occurrenceId)).size,1);
});
test('different literal anchor excerpts for the same located quote consolidate without losing anchors',async()=>{
 const text='Q: Were you the director in 2016?\nA: Yes.',other='Q: Did you hold that role?\nA: Probably.';
 const cases=['Were you the director in 2016?','the director in 2016?'].map(sourceQuestion=>candidate(claim('Yes.',{sourceQuestion}),claim('Probably.')));
 const result=await executePlan({plan:buildPlan([text,other],[],'rules'),texts:[text,other],instructions:'rules',callModel:async()=>message(cases)});
 assert.equal(result.contradictions.length,1);assert.equal(result.analysis.duplicatesCombined,1);
 assert.equal(result.contradictions[0].supportingAnalyses.length,2);
 assert.equal(result.contradictions[0].supportingAnalyses[1].sourceAnchors.claim1.sourceQuestion,'the director in 2016?');
});
