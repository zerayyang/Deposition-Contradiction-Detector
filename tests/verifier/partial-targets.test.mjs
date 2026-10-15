import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {checkResponse,partialTarget} from './checks.mjs';
import {runVerifier} from './verify.mjs';
import {writeReports} from './report.mjs';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const a='I think that I might have visited the office. I cannot remember the date.',fragment='I might have visited the office.',b='I visited the office on Monday.';
const row={id:'partial-context',status:'approved',transcript1_text:`Q. Did you visit?\nA. ${a}`,transcript2_text:`Q. When?\nA. ${b}`,target_claims:{claim1:a,claim2:b},expected_type:'INFERENTIAL',expected_evidence:'CONFLICT',expected_score_band:'MODERATE',tricky_feature:'Shortened exact witness passage',rationale:'Synthetic review fixture, not calibrated evidence.'};
const candidate=(x=fragment,y=b)=>assessCandidate({type:'INFERENTIAL',severity:'MEDIUM',reasoning:'Synthetic fixture',claim1:claim(x),claim2:claim(y)},row.transcript1_text,row.transcript2_text);
const body=c=>({topicsReviewed:[],contradictions:c});
test('shortened source pair exposes omitted context without target credit; report highlights passages',async()=>{
 const c=candidate(),r=checkResponse(body([c]),row);
 assert.equal(r.outcome,'PARTIAL_TARGET_REVIEW');assert.equal(r.failureCategory,'match_issue');assert.equal(r.pass,false);assert.equal(r.candidates.length,0);
 assert.equal(r.partialTargetFindings[0].spans.claim1.omittedBefore,'I think that ');assert.equal(r.partialTargetFindings[0].spans.claim1.omittedAfter,' I cannot remember the date.');
 const result=await runVerifier({rows:[row],invariants:{pass:true},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(body([c]))})});
 assert.equal(result.summary.partialTargetReviewAttempts,3);assert.equal(result.summary.classificationEvaluatedRuns,0);assert.equal(result.summary.typeAccuracyPercent,null);assert.equal(result.summary.passedAttempts,0);assert.equal(result.cases[0].humanRecheck,false);
 const dir=await mkdtemp('/private/tmp/partial-review-');
 try{await writeReports(result,dir);const html=await readFile(join(dir,'report.html'),'utf8');assert.match(html,/Partial target passages — human review required/);assert.match(html,/<mark>I might have visited the office\.<\/mark>/);assert.match(html,/Omitted before: I think that/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('negative target fragments cannot silently pass as not flagged',()=>{
 for(const expected of [{expected_type:'FALSE_POSITIVE'},{expected_evidence:'NOT_EVALUABLE',expected_score_band:null}]){
  const r=checkResponse(body([candidate()]),{...row,...expected});assert.equal(r.notFlagged,false);assert.equal(r.pass,false);assert.equal(r.outcome,'PARTIAL_TARGET_REVIEW');
 }
});
test('short, repeated passages and omitted negation are review only',()=>{
 const repeated={...row,transcript1_text:'Q. Did you sign?\nA. No.\nQ. Did you call?\nA. No.',target_claims:{claim1:'A. No.',claim2:b}};
 const p=partialTarget({claim1:claim('No'),claim2:claim(b)},repeated);assert.equal(p.spans.claim1.ambiguousSource,true);assert.equal(p.requiresHumanReview,true);
 const denial={...row,transcript1_text:'I did not sign the agreement.',target_claims:{claim1:'I did not sign the agreement.',claim2:b}};
 const r=checkResponse(body([{...candidate(),claim1:claim('sign the agreement.')}]),denial);assert.equal(r.outcome,'PARTIAL_TARGET_REVIEW');assert.equal(r.partialTargetFindings[0].spans.claim1.omittedBefore,'I did not ');
});
test('both witness sides must match literally; invented, rewritten, question-only and swapped quotes do not qualify',()=>{
 for(const [x,y] of [['i might have visited the office.',b],[fragment,'invented'],['',b],[b,fragment],['Did you visit?',b]])assert.equal(partialTarget({claim1:claim(x),claim2:claim(y)},row),null);
});
test('retain all partials; full targets are selected independently of labels',()=>{
 const short=candidate(),full=candidate(a),r=checkResponse(body([short,{...short,type:'DIRECT'},full]),row);assert.equal(r.partialTargetReview,false);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].index,2);assert.equal(r.partialTargetFindings.length,2);
});
test('different relationship terms cannot gain conflict support from model metadata',()=>{
 const x='I never had a business partnership with her.',y='I engaged in conduct that was wrong.';
 for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE']){
  const c=assessCandidate({type,severity:'HIGH',reasoning:'These mean the same thing.',semanticAssist:{relationship:'CONFLICT'},claim1:claim(x),claim2:claim(y)},x,y);assert.equal(c.status,'NOT_EVALUABLE');assert.equal(c.score,null);assert.equal(c.humanConfidence,null);assert.deepEqual(c.rulesFired,[]);
 }
});
