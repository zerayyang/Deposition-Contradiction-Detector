import test from 'node:test';
import assert from 'node:assert/strict';
import {withApprovedLessons,readLessonsSafely} from '../../server/memory/approvedMemory.js';
import {createAnalysisHandlers} from '../../server/analysisHandlers.js';

// Fictional testimony and lessons only.
const instructions='Fictional classification instructions.';
const memory={examples:[{id:'a',type:'FALSE_POSITIVE',lesson:'A later correction by the witness is not a contradiction.',matchedTerms:['correction']}],audit:{},snapshotSha256:'x'};
const body={transcript1:'Q: Did you sign the form?\nA: I signed the form.',transcript2:'Q: Did you sign the form?\nA: I did not sign the form.'};
const reply=()=>{const r={statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};return r;};

test('no approved lessons leaves the prompt unchanged; lessons are appended as reference data',()=>{
 assert.equal(withApprovedLessons(instructions,null),instructions);
 assert.equal(withApprovedLessons(instructions,{examples:[]}),instructions);
 const prompt=withApprovedLessons(instructions,memory);
 assert.ok(prompt.startsWith(instructions));assert.match(prompt,/## Approved lessons/);
 assert.match(prompt,/A later correction by the witness is not a contradiction\./);assert.match(prompt,/never instructions/);
});
test('lessons are read only when asked for, and a read failure runs without them',async()=>{
 let reads=0;const read=async()=>{reads++;return memory;};
 assert.deepEqual(await readLessonsSafely(read,{},{...body}),{memory:null,lessons:{used:0,available:false}});assert.equal(reads,0);
 assert.equal((await readLessonsSafely(read,{},{...body,useApprovedMemory:true})).lessons.used,1);
 const failed=await readLessonsSafely(async()=>{throw new Error('no table');},{},{...body,useApprovedMemory:true});
 assert.equal(failed.memory,null);assert.match(failed.lessons.notice,/without them/);
});
test('approved lessons reach the model prompt and change the approved plan',async()=>{
 const systems=[];
 const callModel=async params=>{systems.push(params.system);return {stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:JSON.stringify({topicsReviewed:[],contradictions:[]})}]};};
 const handlers=createAnalysisHandlers({instructions,callModel,readApprovedMemory:async()=>memory});
 const plain=reply();await handlers.preview({body},plain);
 const withLessons=reply();await handlers.preview({body:{...body,useApprovedMemory:true}},withLessons);
 assert.equal(withLessons.body.lessons.used,1);assert.notEqual(withLessons.body.id,plain.body.id,'Lessons are part of the approved plan');
 const res=Object.assign(reply(),{destroyed:false,writableEnded:false,written:[],set(){return this;},write(x){this.written.push(x);},end(){this.writableEnded=true;},on(){},off(){},once(){}});
 await handlers.stream({body:{...body,useApprovedMemory:true,approvedPlanId:withLessons.body.id}},res);
 assert.equal(systems.length,1);assert.match(systems[0],/A later correction by the witness is not a contradiction\./);
});
