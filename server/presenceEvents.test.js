import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceEvents,presenceIndex} from './presenceEvents.js';
import {buildPlan,userContent,executePlan} from './documentAnalysis.js';
const qa=answer=>`Q: Were you at the Elm Cafe on the morning of February 6?\nA: ${answer}`;
test('presence records preserve governing question, original answer offsets and unknown companions',()=>{
 for(const [answer,expected] of [["No, I wasn't there.",'DENIED'],['Yes, I was at the Elm Cafe that morning.','AFFIRMED'],["I don't remember.",'UNKNOWN']]){
  const text=qa(answer),[event]=presenceEvents(text);assert.equal(event.presence,expected);assert.equal(event.place,'the Elm Cafe');assert.equal(event.occasion,'the morning of February 6');assert.equal(event.otherPeople,'UNKNOWN');
  assert.equal(text.slice(event.source.answerStart,event.source.answerEnd).trim(),answer);assert.equal(text.slice(event.source.questionStart,event.source.questionEnd).trim(),'Were you at the Elm Cafe on the morning of February 6?');
 }
});
test('unrelated later hedge cannot turn a clear denial into uncertainty; corrections remain unresolved',()=>{
 assert.equal(presenceEvents(qa("No, I wasn't there. I think my shift started at nine."))[0].presence,'DENIED');
 for(const answer of ["No, I wasn't there. Actually, I was there.","Yes, I wasn't there.","Maybe I was there.","No, I don't remember being there."])
  assert.equal(presenceEvents(qa(answer))[0].presence,'UNKNOWN',answer);
});
test('compound questions and unsupported witness formats do not become verified presence assertions',()=>{
 assert.equal(presenceEvents('Q: Were you at the Elm Cafe or the Harbor Cafe on February 6?\nA: No.')[0].presence,'UNKNOWN');
 assert.deepEqual(presenceEvents('Q: Were you at the Elm Cafe on February 6?\nMR. LAWYER: Yes.\nA: No.'),[]);
 assert.deepEqual(presenceEvents('Q: Did you speak to anyone?\nA: No.'),[]);
 assert.deepEqual(presenceEvents('I was there.'),[]);
});
test('records keep different occasions and places distinct and never derive numeric confidence or a category',()=>{
 const index=presenceIndex(qa('No.'),'Q: Were you at the Harbor Cafe on February 7?\nA: Yes.');
 assert.notEqual(index.transcript1[0].place,index.transcript2[0].place);assert.notEqual(index.transcript1[0].occasion,index.transcript2[0].occasion);
 assert.ok(!Object.hasOwn(index,'score'));assert.ok(!Object.hasOwn(index,'type'));assert.match(index.notice,/Read all testimony/);
});
test('model receives the bounded index and the entire unchanged testimony; inputs without supported events keep the old content',()=>{
 const first=qa('No.'),second=qa('Yes.'),body=userContent({text:first},{text:second});
 assert.ok(body.includes('<source_presence_index>'));assert.ok(body.includes(`<transcript_1>\n${first}\n</transcript_1>`));assert.ok(body.includes(`<transcript_2>\n${second}\n</transcript_2>`));
 assert.doesNotMatch(userContent({text:'First text.'},{text:'Second text.'}),/source_presence_index/);
 const plan=buildPlan([first,second],[],'fictional instructions');assert.ok(plan.cost.inputTokenUpperBudget>=Buffer.byteLength(body));
});
test('index is built before the mocked model call without replacing or scoring its classification',async()=>{
 const texts=[qa('No.'),qa('Yes.')],instructions='fictional instructions',plan=buildPlan(texts,[],instructions);let calls=0;
 const result=await executePlan({plan,texts,instructions,callModel:async params=>{calls++;assert.match(params.messages[0].content,/source_presence_index/);return {stop_reason:'end_turn',content:[{type:'text',text:'{"topicsReviewed":[],"contradictions":[]}'}],usage:{input_tokens:1,output_tokens:1}};}});
 assert.equal(calls,1);assert.equal(result.analysis.status,'complete');assert.deepEqual(result.contradictions,[]);
});
