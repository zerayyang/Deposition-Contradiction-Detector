import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveredDraft,recoveryRequest} from './recovery.js';
const a={type:'DIRECT',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'}},b={type:'INFERENTIAL',claim1:{original:'About ten.'},claim2:{original:'About twenty.'}};
test('recovery preserves original file references and relocates notes by finding identity',()=>{
 const current={files:[{path:'owner/case/a.pdf',name:'a.pdf'}],results:[a,b],notes:{0:'Check signature',1:'Check number'},reviewed:{0:true}};
 const got=recoveredDraft(current,{id:'job',state:'interrupted',texts:['first','second'],documents:[{extraction:{pages:[]}}],result:{contradictions:[b,a],analysis:{status:'running',completed:1}}});
 assert.equal(got.files[0].path,current.files[0].path);assert.equal(got.notes[1],'Check signature');assert.equal(got.reviewed[1],true);assert.equal(got.analysis.status,'interrupted');assert.equal(got.analysis.jobId,'job');
});
test('recovery never invents a completed result and surfaces server/session failures',async()=>{
 assert.throws(()=>recoveredDraft({}, {result:null}),/No completed checkpoint/);
 await assert.rejects(recoveryRequest(async()=>({ok:false,json:async()=>({error:'Sign in again'})}),'/id'),/Sign in again/);
});
test('preparing a new run does not mutate saved results; only the working draft resets',async()=>{
 const {beginAnalysisDraft}=await import('./recovery.js');const original={texts:['one','two'],files:[{path:'saved.pdf'}],results:[a],analysis:{status:'complete'},notes:{0:'Important'},reviewed:{0:true}};
 const fresh=beginAnalysisDraft(original);assert.equal(fresh.results,null);assert.deepEqual(fresh.notes,{});assert.deepEqual(original.results,[a]);assert.equal(original.notes[0],'Important');assert.equal(fresh.files[0].path,'saved.pdf');
 assert.equal(beginAnalysisDraft(original,true),original);
});
