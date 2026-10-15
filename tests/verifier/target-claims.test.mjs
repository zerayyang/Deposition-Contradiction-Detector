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
 assert.match(checkResponse(body([{...c,claim1:claim('other')}]),row).errors.join(' '),/NO_TARGET_PAIR_FAIL/);
 assert.match(checkResponse(body([c,c]),row).errors.join(' '),/DUPLICATE_TARGET_PAIRS_FAIL/);
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
