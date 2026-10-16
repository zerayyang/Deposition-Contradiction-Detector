import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAnalysisHandlers} from './analysisHandlers.js';
import {createJobStore} from './jobStore.js';
import {buildPlan,executePlan} from './documentAnalysis.js';
const instructions='Fictional source-role transport test.';
const body={caseId:'fictional-role-case',transcript1:'Q: At the Monday meeting, did you sign the form?\nA: I signed the form.',transcript2:'MS. REED: At the Monday meeting, did you sign the form?\nPRESIDENT VALE: I did not sign the form.',speakerRoles:[{},{'MS. REED':'QUESTIONER','PRESIDENT VALE':'WITNESS'}],sourceRolesReviewed:true};
const claim=original=>({original,activityPhrase:original,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const candidate={type:'DIRECT',severity:'HIGH',reasoning:'Scripted conflicting assertions.',claim1:claim('I signed the form.'),claim2:claim('I did not sign the form.')};
const message=c=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({topicsReviewed:['signing'],contradictions:[c]})}],usage:{input_tokens:0,output_tokens:0}});
const response=()=>Object.assign(new EventEmitter(),{statusCode:200,lines:[],writableEnded:false,destroyed:false,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;},flushHeaders(){},write(v){this.lines.push(JSON.parse(v));},end(){this.writableEnded=true;}});
test('reviewed named speakers reach the model, source binding and deterministic score through short API',async()=>{
 let calls=0;
 const handlers=createAnalysisHandlers({instructions,codeFingerprint:'fixture-build',callModel:async params=>{calls++;assert.match(params.messages[0].content,/<reviewed_source_roles>/);return message(candidate);}});
 const res=response();await handlers.analyze({body},res);
 assert.equal(res.statusCode,200);assert.equal(calls,1);
 const f=res.body.contradictions[0];assert.equal(f.claim2Valid,true);assert.equal(f.sourceBindings.claim2.status,'BOUND');assert.equal(f.sourceBindings.claim2.selected.speaker,'PRESIDENT VALE');assert.match(f.sourceBindings.claim2.selected.question,/Monday meeting/);assert.equal(f.status,'CONFLICT_SUPPORTED');assert.equal(f.score,90);assert.equal(res.body.analysis.provenance.codeFingerprint,'fixture-build');
});
test('unknown speakers and model-supplied role declarations never grant witness status',async()=>{
 const plan=buildPlan([body.transcript1,body.transcript2],[],instructions);
 const result=await executePlan({plan,texts:[body.transcript1,body.transcript2],instructions,callModel:async()=>message({...candidate,speakerRoles:body.speakerRoles,claim2:{...candidate.claim2,speakerRoles:body.speakerRoles[1],role:'WITNESS'}})});
 const f=result.contradictions[0];assert.equal(f.claim2Valid,false);assert.equal(f.notEvaluableReason,'UNVERIFIED_SOURCE');assert.equal(f.score,null);
});
test('role maps require explicit review, reject reserved mappings and bind plan identity',()=>{
 const texts=[body.transcript1,body.transcript2];
 assert.throws(()=>buildPlan(texts,[],instructions,{speakerRoles:body.speakerRoles}),/sourceRolesReviewed/);
 assert.throws(()=>buildPlan(texts,[],instructions,{speakerRoles:[{}, {'THE COURT':'WITNESS'}],sourceRolesReviewed:true}),/Court/);
 const reviewed=buildPlan(texts,[],instructions,body),unknown=buildPlan(texts,[],instructions);
 assert.notEqual(reviewed.id,unknown.id);
 const other=buildPlan(texts,[],instructions,{...body,speakerRoles:[{}, {'MS. REED':'QUESTIONER','PRESIDENT VALE':'OTHER'}]});assert.notEqual(reviewed.id,other.id);
});
test('stream recovery preserves role maps and refuses changed assignments before any new call',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'roles-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createJobStore(directory);let calls=0;
 const handlers=createAnalysisHandlers({instructions,codeFingerprint:'fixture-build',jobStore:store,callModel:async()=>{calls++;return message(candidate);}});
 const req={identity:{id:'fictional-owner'},body};const preview=response();await handlers.preview(req,preview);
 assert.equal(calls,0);assert.equal(preview.body.provenance.codeFingerprint,'fixture-build');
 const streamed=response();await handlers.stream({...req,body:{...body,approvedPlanId:preview.body.id}},streamed);
 assert.equal(calls,1);const final=streamed.lines.find(v=>v.event==='result');assert.equal(final.analysis.status,'complete');assert.equal(final.contradictions[0].claim2Valid,true);
 const stored=await store.get(final.jobId,req.identity.id);assert.equal(stored.provenance.speakerRoles[1]['PRESIDENT VALE'],'WITNESS');
 const original=response();await handlers.preview({...req,body:{caseId:body.caseId,resumeJobId:stored.id}},original);assert.equal(original.statusCode,200);assert.equal(original.body.id,preview.body.id);
 const changed=response();await handlers.preview({...req,body:{caseId:body.caseId,resumeJobId:stored.id,speakerRoles:[{}, {'PRESIDENT VALE':'OTHER'}],sourceRolesReviewed:true}},changed);assert.equal(changed.statusCode,400);assert.match(changed.body.error,/roles changed/);assert.equal(calls,1);
});
