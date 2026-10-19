import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRequestBody} from './reviewPlan.js';
import {previewAnalysis} from './analysisClient.js';

const saved=()=>({texts:['Q: Did you sign?\nA: Yes.','Q: Did you sign?\nA: No.'],files:[null,null],
  results:[{id:'saved-finding'}],notes:{0:'retain this note'},reviewed:{0:true},
  analysis:{status:'partial',cloudJobId:'old-deployment-job',tasks:[{status:'complete'},{status:'pending'}]}});
test('fresh review omits every saved job identity and preserves documents, findings and notes',()=>{
  const source=saved(),before=structuredClone(source);
  const body=reviewRequestBody(source,{caseId:'saved-case'});
  assert.equal(body.cloudJobId,undefined);assert.equal(body.resumeJobId,undefined);
  assert.equal(body.transcript1,source.texts[0]);assert.equal(body.transcript2,source.texts[1]);
  assert.deepEqual(source,before);assert.equal(body.useApprovedMemory,true);
});
test('explicit recovery retains eligible job identity without weakening provenance checks',()=>{
  assert.equal(reviewRequestBody(saved(),{caseId:'saved-case',resumeCloud:true}).cloudJobId,'old-deployment-job');
  const source=saved();source.analysis.status='complete';
  assert.throws(()=>reviewRequestBody(source,{caseId:'saved-case',resumeCloud:true}),/cannot continue/);
  assert.equal(reviewRequestBody(source,{caseId:'saved-case',local:true,resumeJobId:'local-recovery'}).resumeJobId,'local-recovery');
});
test('stale saved job no longer blocks free preview; no analysis endpoint is invoked',async()=>{
  const source=saved();let requests=0;
  const plan=await previewAnalysis(reviewRequestBody(source,{caseId:'saved-case'}),{fetchImpl:async(url,options)=>{
    requests++;assert.equal(url,'/api/analysis/plan');const body=JSON.parse(options.body);
    assert.equal(body.cloudJobId,undefined);assert.equal(body.resumeJobId,undefined);
    return {ok:true,json:async()=>({id:'fresh-plan',requestCount:1,cost:{estimated:0.01,conservativeBudget:0.1}})};
  }});
  assert.equal(plan.id,'fresh-plan');assert.equal(requests,1);assert.equal(source.results[0].id,'saved-finding');
});
