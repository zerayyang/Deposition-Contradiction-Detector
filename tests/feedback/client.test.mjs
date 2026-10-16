import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackStore,activeFeedbackExamples,latestFeedbackDecision} from '../../src/lib/feedbackStore.js';
const id='10000000-0000-0000-0000-000000000001';
const proposal=()=>({caseId:id,findingIndex:0,finding:{type:'DIRECT',claim1:{original:'Fictional source one.'},claim2:{original:'Fictional source two.'}},proposedType:'INFERENTIAL',rationale:'Fictional correction requiring independent review.',requestId:id});
const reviewer=()=>({feedbackId:id,decision:'APPROVE',rationale:'Independent fictional source review.',sourceChecked:true,expectedDecisionId:null});
function fixture(){const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:id,error:null};},from:()=>{throw new Error('No direct write should occur');}};return {store:createFeedbackStore(client),calls,client};}
test('submission uses the authenticated RPC and never edits the original finding',async()=>{
 const {store,calls}=fixture(),input=proposal(),before=structuredClone(input);assert.equal(await store.submit(input),id);assert.deepEqual(input,before);
 assert.equal(calls[0].name,'submit_finding_feedback');assert.equal(calls[0].args.p_request_id,id);assert.deepEqual(calls[0].args.p_expected_finding,input.finding);
 assert.equal('owner_id' in calls[0].args,false);assert.equal('status' in calls[0].args,false);
});
test('ownership, scores, approval flags and invalid categories cannot be submitted',async()=>{
 const {store,calls}=fixture();for(const extra of [{ownerId:id},{score:99},{approved:true},{proposedType:'OTHER'},{rationale:'short'},{findingIndex:-1}])await assert.rejects(()=>store.submit({...proposal(),...extra}));
 assert.equal(calls.length,0);
});
test('review requires an explicit source check and carries the optimistic decision token',async()=>{
 const {store,calls}=fixture();await assert.rejects(()=>store.review({...reviewer(),sourceChecked:false}));assert.equal(calls.length,0);
 await store.review(reviewer());assert.equal(calls[0].name,'review_finding_feedback');assert.equal(calls[0].args.p_expected_decision_id,null);
 await assert.rejects(()=>store.review({...reviewer(),reviewerId:id}));
});
test('database errors remain visible and no automatic retry or fallback approval occurs',async()=>{
 const {store,client,calls}=fixture();client.rpc=async(name,args)=>{calls.push({name,args});return {data:null,error:{code:'42501',message:'Separate reviewer required.'}};};
 await assert.rejects(()=>store.review(reviewer()),/Separate reviewer/);assert.equal(calls.length,1);
 client.rpc=async()=>({error:{code:'42883',message:'missing function'}});await assert.rejects(()=>store.submit(proposal()),/migration/);
});
test('pagination exposes more rows instead of silently claiming a complete history',async()=>{
 const operations=[],chain={select:()=>chain,eq:()=>chain,order:()=>chain,range:async(a,b)=>{operations.push([a,b]);return {data:[{id:'a'},{id:'b'},{id:'c'}],error:null};}};
 const store=createFeedbackStore({rpc:()=>{},from:()=>chain});const page=await store.listDecisions(id,{offset:0,limit:2});assert.equal(page.rows.length,2);assert.equal(page.nextOffset,2);assert.deepEqual(operations,[[0,2]]);
 await assert.rejects(()=>store.listDecisions(id,{limit:1000}));
});
test('revocation and newer approvals never erase the historical rows',()=>{
 const examples=[{id:'one',feedback_id:'f',decision_id:'d1'}],rows=[{id:'d1',feedback_id:'f',decision:'APPROVE',revision:1},{id:'d2',feedback_id:'f',decision:'REVOKE',revision:2}];
 assert.equal(latestFeedbackDecision('f',rows).id,'d2');assert.throws(()=>activeFeedbackExamples(examples,rows),/Complete decision history/);
 assert.deepEqual(activeFeedbackExamples(examples,rows,{historyComplete:true}),[]);assert.equal(examples.length,1);assert.equal(rows.length,2);
});
