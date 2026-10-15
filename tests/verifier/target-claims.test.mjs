import test from 'node:test';
import assert from 'node:assert/strict';
import {checkResponse,validateGold} from './checks.mjs';
import {runVerifier} from './verify.mjs';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
import {writeReports} from './report.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
const a='I never signed the agreement.',b='I signed the agreement.';
const claim=original=>({original,activityPhrase:original,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const c=assessCandidate({type:'DIRECT',severity:'HIGH',reasoning:'Synthetic protocol fixture',claim1:claim(a),claim2:claim(b)},a,b);
const row={id:'target-protocol',transcript1_text:a,transcript2_text:b,expected_type:'DIRECT',expected_evidence:'CONFLICT',expected_score_band:'MODERATE',tricky_feature:'Synthetic protocol fixture',rationale:'Synthetic protocol fixture',status:'approved',target_claims:{claim1:a,claim2:b},judicial_relation:'supports',conflict_basis:'judicial_reference',type_basis:'project_rule',judicial_expected_evidence:'COMPATIBLE'};
const body=contradictions=>({topicsReviewed:[],contradictions});
test('target finding passes with malformed unrelated extras and separate judicial disagreement',()=>{
 const r=checkResponse(body([null,{claim1:{original:'unrelated'}},c]),row);
 assert.deepEqual(r.errors,[]);assert.equal(r.candidates.length,1);assert.equal(r.extraFindings.length,2);assert.equal(r.judicialAgreement.agrees,false);assert.equal(r.pass,true);
});
test('missing target cannot pass on unrelated findings; duplicate targets fail',()=>{
 assert.match(checkResponse(body([{...c,claim1:claim('other')}]),row).errors.join(' '),/TARGET_NOT_MATCHED/);
 assert.match(checkResponse(body([c,c]),row).errors.join(' '),/DUPLICATE_TARGET_PAIRS_FAIL/);
});
test('negative target absence passes not flagged, including NOT_EVALUABLE with a nonnegative expected type',async()=>{
 for(const protocol of [{...row,expected_type:'FALSE_POSITIVE'},{...row,expected_evidence:'NOT_EVALUABLE',expected_score_band:null}]){
  const checked=checkResponse(body([null]),protocol);
  assert.equal(checked.pass,true);assert.equal(checked.outcome,'NOT_FLAGGED');assert.equal(checked.extraFindings.length,1);
  const result=await runVerifier({rows:[protocol],invariants:{pass:true},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(body([]))})});
  assert.equal(result.pass,true);assert.equal(result.cases[0].typeStable,true);assert.equal(result.summary.notFlaggedAttempts,3);assert.equal(result.summary.classificationEvaluatedRuns,0);assert.equal(result.summary.typeAccuracyPercent,null);assert.equal(result.summary.passedAttempts,3);
 }
});
test('a returned DIRECT or INFERENTIAL target fails an expected negative even when it matches the stored type',()=>{
 for(const expected of [{...row,expected_type:'FALSE_POSITIVE'},{...row,expected_evidence:'NOT_EVALUABLE',expected_score_band:null}])for(const type of ['DIRECT','INFERENTIAL']){
  const result=checkResponse(body([{...c,type}]),expected);
  assert.equal(result.pass,false);assert.equal(result.failureCategory,'classification');assert.match(result.errors.join(' '),/NEGATIVE_TARGET_FLAGGED/);
 }
});
test('missing positive target is a match issue, ranks nearby extras, and never counts as classification failure',async()=>{
 const nearby={...c,claim1:claim('never signed the agreement.')},far={...c,claim1:claim('The weather was sunny.'),claim2:claim('It rained.')};
 const response=body([far,nearby]);
 const checked=checkResponse(response,row);
 assert.equal(checked.outcome,'PARTIAL_TARGET_REVIEW');assert.equal(checked.failureCategory,'match_issue');assert.equal(checked.nearestExtraFindings[0].index,1);assert.equal(checked.candidates.length,0);
 const result=await runVerifier({rows:[row],invariants:{pass:true,output:'stub'},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(response)})});
 assert.equal(result.pass,false);assert.equal(result.summary.targetNotMatchedAttempts,3);assert.equal(result.summary.classificationFailedAttempts,0);assert.equal(result.summary.classificationEvaluatedRuns,0);assert.equal(result.summary.typeAccuracyPercent,null);assert.equal(result.cases[0].humanRecheck,false);
 const dir=await mkdtemp('/private/tmp/target-match-report-');
 try{await writeReports(result,dir);const html=await readFile(join(dir,'report.html'),'utf8');assert.match(html,/PARTIAL_TARGET_REVIEW — check omitted context/);assert.match(html,/Omitted before: I /);assert.match(html,/nearest extra findings/);assert.match(html,/never signed the agreement/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('unscoped negative omission keeps legacy one-pair contract',()=>{
 const {target_claims,...legacy}=row;
 assert.equal(checkResponse(body([]),{...legacy,expected_type:'FALSE_POSITIVE'}).pass,false);
});
test('matching is exact, directional, and independent of expected labels',()=>{
 assert.equal(checkResponse(body([c]),{...row,target_claims:{claim1:'A. '+a,claim2:b}}).candidates.length,1);
 assert.equal(checkResponse(body([c]),{...row,target_claims:{claim1:'A: '+a,claim2:b}}).candidates.length,1);
 assert.equal(checkResponse(body([{...c,claim1:claim(a.toLowerCase())}]),row).candidates.length,0);
 assert.equal(checkResponse(body([{...c,type:'INFERENTIAL'}]),row).candidates.length,1);
 assert.match(checkResponse(body([{...c,type:'INFERENTIAL'}]),row).errors.join(' '),/type mismatch/);
});
test('target claims and judicial metadata fail closed; exclusions never execute',async()=>{
 assert.deepEqual(validateGold([row]).errors,[]);
 for(const patch of [{target_claims:{claim1:'invented',claim2:b}},{judicial_relation:'DIRECT'},{type_basis:'judicial_reference'}])assert.ok(validateGold([{...row,...patch}]).errors.length);
 for(const patch of [{superseded_by:'new-id'},{verification_policy:{exclude:true,reason:'judge-disputed'}},{review_status:'judge-disputed'}]){
  const r=await runVerifier({rows:[{...row,...patch}],invariants:{pass:true},fetchImpl:()=>assert.fail('excluded case requested')});
  assert.equal(r.selection.selected,0);assert.equal(r.rejected.length,1);
 }
});
test('target aggregate stability ignores extra findings and report separates judicial agreement',async()=>{
 const r=await runVerifier({rows:[row],invariants:{pass:true,output:'Synthetic stub'},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(body([c,null]))})});
 assert.equal(r.pass,true);assert.equal(r.summary.passedAttempts,3);assert.equal(r.cases[0].typeStable,true);
 const dir=await mkdtemp('/private/tmp/target-claims-report-');
 try{await writeReports(r,dir);const html=await readFile(join(dir,'report.html'),'utf8');assert.match(html,/Agreement with judicial reference \(informational\)/);assert.match(html,/Extra findings — informational, not failures/);}finally{await rm(dir,{recursive:true,force:true});}
});
