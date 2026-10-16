import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createJobStore} from '../../server/jobStore.js';
import {buildPlan,executePlan} from '../../server/documentAnalysis.js';
import {createAnalysisHandlers} from '../../server/analysisHandlers.js';
const claim=original=>({original,activityPhrase:original,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const c={type:'DIRECT',severity:'LOW',reasoning:'Synthetic signing comparison.',claim1:claim('I signed the lease.'),claim2:claim('I did not sign the lease.')};
const message=()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({topicsReviewed:['signing'],contradictions:[c]})}],usage:{input_tokens:10,output_tokens:20}});
const texts=['Q: What happened on Monday?\nA: I signed the lease.','Q: What happened on Monday?\nA: I did not sign the lease.'];
const response=()=>Object.assign(new EventEmitter(),{lines:[],statusCode:200,writableEnded:false,destroyed:false,status(n){this.statusCode=n;return this;},set(){return this;},json(b){this.body=b;this.writableEnded=true;return this;},write(t){this.lines.push(JSON.parse(t));return true;},flushHeaders(){},end(){this.writableEnded=true;}});
async function temporary(t){const directory=await mkdtemp(path.join(tmpdir(),'deposition-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
test('atomic private checkpoints survive a new store instance; ownership and active deletion are enforced',async t=>{
 const directory=await temporary(t),store=createJobStore(directory);
 const record=await store.create({ownerId:'alice',caseId:'case-a',texts,documents:[],planId:'plan',provenance:{codeFingerprint:'v1'}});
 store.activate(record.id);await assert.rejects(store.remove(record.id,'alice'),/Cancel/);
 await store.checkpoint(record,{contradictions:[c],analysis:{completed:1,status:'running'}},'running');
 const restarted=createJobStore(directory),got=await restarted.get(record.id,'alice');
 assert.equal(got.state,'interrupted');assert.deepEqual(got.texts,texts);assert.equal(got.result.contradictions.length,1);
 await assert.rejects(restarted.get(record.id,'bob'),/not found/);assert.equal((await restarted.list('bob')).length,0);
 assert.equal((await readdir(directory)).filter(n=>n.endsWith('.tmp')).length,0);
 if(process.platform!=='win32')assert.equal((await stat(path.join(directory,`${record.id}.json`))).mode&0o777,0o600);
});
test('oversized checkpoint failure retains the last complete durable write',async t=>{
 const directory=await temporary(t),store=createJobStore(directory,{maxBytes:2000});
 const record=await store.create({ownerId:'alice',caseId:'case-a',texts,documents:[],planId:'plan',provenance:{}});
 await assert.rejects(store.checkpoint(record,{large:'x'.repeat(3000)}),/storage budget/);
 assert.equal((await store.get(record.id,'alice')).result,null);
});
test('executor waits for durable checkpoints; a failed save prevents all later model calls',async()=>{
 const plan=buildPlan(texts,[],'rules',{singleRequestBytes:1,chunkBytes:40,overlapBytes:0});let calls=0;
 await assert.rejects(executePlan({plan,texts,instructions:'rules',callModel:async()=>{calls++;return message();},onEvent:async event=>{if(event.event==='checkpoint')throw new Error('DISK_FULL');}}),/DISK_FULL/);
 assert.equal(calls,1);
});
test('resume skips completed requests, preserves findings/history and refuses another plan',async()=>{
 const longTexts=texts.map(text=>text+'\nQ: What happened on Tuesday?\nA: I read the papers.');
 const plan=buildPlan(longTexts,[],'rules',{singleRequestBytes:1,chunkBytes:90,overlapBytes:0});assert.ok(plan.requestCount>1);
 const controller=new AbortController();let calls=0;
 const first=await executePlan({plan,texts:longTexts,instructions:'rules',signal:controller.signal,callModel:async()=>{calls++;return message();},onEvent:async e=>{if(e.event==='checkpoint')controller.abort();}});
 const completed=first.analysis.completed;assert.equal(calls,1);assert.equal(completed,1);
 let resumedCalls=0;
 const second=await executePlan({plan,texts:longTexts,instructions:'rules',resume:first,callModel:async()=>{resumedCalls++;return { ...message(),content:[{type:'text',text:JSON.stringify({topicsReviewed:[],contradictions:[]})}]};}});
 assert.equal(resumedCalls,plan.requestCount-completed);assert.equal(second.analysis.completed,plan.requestCount);assert.equal(second.contradictions.length,first.contradictions.length);
 assert.equal(second.analysis.usage.input_tokens,10*plan.requestCount);
 await assert.rejects(executePlan({plan:{...plan,id:'other'},texts:longTexts,instructions:'rules',resume:first,callModel:async()=>{throw new Error('must not call');}}),/different plan/);
});
test('handler persists progress and completion before sending them; GET recovery does not call a model',async t=>{
 const directory=await temporary(t),jobStore=createJobStore(directory);let calls=0;
 const handlers=createAnalysisHandlers({instructions:'rules',jobStore,codeFingerprint:'v1',callModel:async()=>{calls++;return message();}});
 const plan=buildPlan(texts,[],'rules'),res=response();
 await handlers.stream({identity:{id:'alice'},body:{transcript1:texts[0],transcript2:texts[1],documents:[],originalDocuments:[{path:'alice/case-a/a.pdf',name:'a.pdf'}],caseId:'case-a',approvedPlanId:plan.id}},res);
 assert.equal(calls,1);const final=res.lines.find(e=>e.event==='result');assert.ok(final.jobId);
 const saved=await createJobStore(directory).get(final.jobId,'alice');assert.equal(saved.state,'complete');assert.equal(saved.result.analysis.completed,1);assert.equal(saved.originalDocuments[0].name,'a.pdf');
 assert.equal(saved.result.analysis.provenance.model,plan.model.id);assert.ok(saved.result.analysis.tasks[0].rawText);assert.ok(saved.result.analysis.tasks[0].responseSha256);
 const recovered=response();await handlers.recover({identity:{id:'alice'},params:{id:final.jobId}},recovered);assert.equal(recovered.body.result.contradictions.length,1);assert.equal(calls,1);
 const forbidden=response();await handlers.recover({identity:{id:'bob'},params:{id:final.jobId}},forbidden);assert.equal(forbidden.statusCode,404);
 const retry=response();await handlers.stream({identity:{id:'alice'},body:{resumeJobId:final.jobId,caseId:'case-a',approvedPlanId:plan.id}},retry);assert.equal(retry.statusCode,409);assert.equal(calls,1);
 const raw=await readFile(path.join(directory,`${final.jobId}.json`),'utf8');assert.doesNotMatch(raw,/Bearer|access_token|api_key/);
});
test('changed code and spending limits refuse paid work before calling the provider',async t=>{
 const directory=await temporary(t),jobStore=createJobStore(directory),plan=buildPlan(texts,[],'rules');let calls=0;
 const record=await jobStore.create({ownerId:'alice',caseId:'case-a',texts,documents:[],planId:plan.id,provenance:{codeFingerprint:'old'}});
 const h=createAnalysisHandlers({instructions:'rules',jobStore,codeFingerprint:'new',maxBudgetUsd:0.000001,callModel:async()=>{calls++;return message();}});
 const req={identity:{id:'alice'},body:{resumeJobId:record.id,caseId:'case-a',approvedPlanId:plan.id}},res=response();await h.stream(req,res);assert.equal(res.statusCode,400);assert.match(res.body.error,/code changed/);
 const normal=response();await h.stream({identity:{id:'alice'},body:{transcript1:texts[0],transcript2:texts[1],caseId:'case-a',approvedPlanId:plan.id}},normal);assert.equal(normal.statusCode,400);assert.match(normal.body.error,/spending allowance/);assert.equal(calls,0);
});
test('an actual killed worker process leaves recoverable complete checkpoints and intact documents',async t=>{
 const {fork}=await import('node:child_process'),directory=await temporary(t);
 const worker=fork(new URL('./crash-worker.mjs',import.meta.url),[directory],{stdio:['ignore','ignore','pipe','ipc']});
 t.after(()=>{worker.kill('SIGKILL');});
 let errors='';worker.stderr.on('data',data=>{errors+=data;});
 const message=await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{worker.kill('SIGKILL');reject(new Error('Worker did not save checkpoint: '+errors));},10000);worker.once('message',m=>{clearTimeout(deadline);resolve(m);});worker.once('error',reject);});
 const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGKILL');await exited;
 const record=await createJobStore(directory).get(message.id,'crash-test');assert.equal(record.state,'interrupted');assert.equal(record.result.analysis.completed,1);assert.equal(record.texts.length,2);assert.ok(message.total>1);
});
test('the owner can cancel a running job after losing its original UI; another owner cannot',async t=>{
 const directory=await temporary(t),jobStore=createJobStore(directory);let began;
 const ready=new Promise(r=>{began=r;});
 const handlers=createAnalysisHandlers({instructions:'rules',jobStore,codeFingerprint:'v1',callModel:(_p,{signal})=>{began();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});
 const plan=buildPlan(texts,[],'rules'),res=response();const stream=handlers.stream({identity:{id:'alice'},body:{caseId:'case-a',transcript1:texts[0],transcript2:texts[1],documents:[],approvedPlanId:plan.id}},res);await ready;
 const id=res.lines.find(e=>e.jobId).jobId,forbidden=response();await handlers.cancel({identity:{id:'bob'},params:{id}},forbidden);assert.equal(forbidden.statusCode,404);assert.equal(jobStore.isActive(id),true);
 const cancelled=response();await handlers.cancel({identity:{id:'alice'},params:{id}},cancelled);await stream;
 assert.equal(cancelled.body.state,'cancelled');assert.equal((await jobStore.get(id,'alice')).result.analysis.status,'cancelled');assert.equal(jobStore.isActive(id),false);
});
