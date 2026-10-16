import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {previewAnalysis,runAnalysis} from '../../src/lib/analysisClient.js';
import {readApiJson} from '../../src/lib/apiResponse.js';
import {checkpointSaveWarning,recoveryRequest} from '../../src/lib/recovery.js';
import {createAnalysisHandlers} from '../../server/analysisHandlers.js';

const response=()=>Object.assign(new EventEmitter(),{statusCode:200,lines:[],writableEnded:false,destroyed:false,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;},flushHeaders(){},write(line){this.lines.push(line);},end(){this.writableEnded=true;}});
test('hosting HTML errors become readable messages, never raw parser errors or HTML',async()=>{
 for(const [status,expected] of [[500,/backend could not start/],[401,/Sign in again/],[413,/request limit/],[429,/busy/],[504,/stopped waiting/]]){
  await assert.rejects(previewAnalysis({}, {fetchImpl:async()=>new Response('<html>PRIVATE_DIAGNOSTIC</html>',{status})}),expected);
 }
 await assert.rejects(recoveryRequest(async()=>new Response('<html>PRIVATE_DIAGNOSTIC</html>',{status:502}),'?caseId=example'),error=>/temporarily unavailable/.test(error.message)&&!error.message.includes('PRIVATE_DIAGNOSTIC'));
 await assert.rejects(readApiJson(new Response('null'),'Invalid plan'),/Invalid plan/);
 await assert.rejects(readApiJson(new Response(JSON.stringify({error:'Sign in again'}),{status:401}),'failed'),/Sign in again/);
});
test('a website page cannot masquerade as an analysis stream; rejected requests are not retried',async()=>{
 let calls=0,events=0;
 await assert.rejects(runAnalysis({}, {id:'example'}, {fetchImpl:async()=>{calls++;return new Response('<html>Not an API</html>',{headers:{'content-type':'text/html'}});},onEvent:()=>events++}),/temporarily unavailable/);
 assert.equal(calls,1);assert.equal(events,0);
 await assert.rejects(runAnalysis({}, {id:'example'}, {fetchImpl:async()=>new Response('unreadable\n')}),/unreadable results/);
});
test('short website workflow previews for free, requires approval and returns a grounded mock finding without disk recovery',async()=>{
 const texts=['Q: What happened on Monday?\nA: I signed the lease.','Q: What happened on Monday?\nA: I did not sign the lease.'];
 const claim=original=>({original,activityPhrase:original,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
 let modelCalls=0;
 const handlers=createAnalysisHandlers({instructions:'fictional transport test',jobStore:null,callModel:async()=>{modelCalls++;return {stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:JSON.stringify({topicsReviewed:['lease'],contradictions:[{type:'DIRECT',severity:'LOW',reasoning:'Opposite signing assertions.',claim1:claim('I signed the lease.'),claim2:claim('I did not sign the lease.')}]})}]};}});
 const body={transcript1:texts[0],transcript2:texts[1],documents:[],caseId:'fictional-case'};
 const fetchImpl=async(url,options)=>{const res=response(),req={identity:{id:'fictional-owner'},body:JSON.parse(options.body)};await (url==='/api/analysis/plan'?handlers.preview:handlers.stream)(req,res);return new Response(res.lines.length?res.lines.join(''):JSON.stringify(res.body),{status:res.statusCode,headers:{'content-type':res.lines.length?'application/x-ndjson':'application/json'}});};
 const plan=await previewAnalysis(body,{fetchImpl});assert.equal(modelCalls,0);assert.equal(plan.requestCount,1);
 await assert.rejects(runAnalysis(body,{id:'unapproved'},{fetchImpl}),/not approved/);assert.equal(modelCalls,0);
 const events=[],result=await runAnalysis(body,plan,{fetchImpl,onEvent:event=>events.push(event)});
 assert.equal(modelCalls,1);assert.equal(result.analysis.status,'complete');assert.equal(result.analysis.recoveryEnabled,false);
 assert.equal(result.contradictions.length,1);assert.equal(result.contradictions[0].type,'DIRECT');
 assert.equal(result.contradictions[0].claim1.original,'I signed the lease.');assert.equal(result.contradictions[0].claim2.original,'I did not sign the lease.');
 assert.ok(events.some(event=>event.event==='checkpoint'));
 const list=response();await handlers.list({identity:{id:'fictional-owner'},query:{}},list);assert.deepEqual(list.body,{jobs:[],recoveryEnabled:false});
});
test('cloud save warnings promise server checkpoints only when explicitly available',()=>{
 const error=new Error('Offline');
 assert.match(checkpointSaveWarning(error,{recoveryEnabled:true}),/server checkpoint remains available/);
 for(const analysis of [undefined,{}, {recoveryEnabled:false}]){
  const warning=checkpointSaveWarning(error,analysis);assert.match(warning,/Keep it open/);assert.doesNotMatch(warning,/server checkpoint remains available/);
 }
});
