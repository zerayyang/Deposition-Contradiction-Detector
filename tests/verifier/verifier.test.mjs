import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerifier } from './verify.mjs';
import { validateGold,checkResponse,checkOrdinal } from './checks.mjs';
import { assessCandidate } from '../../server/humanConfidencePipeline.js';
import { escapeHTML } from './report.mjs';
import { writeReports } from './report.mjs';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const row={id:'protocol-fixture',transcript1_text:'A: I never signed the agreement.',transcript2_text:'A: I signed the agreement.',expected_type:'DIRECT',expected_evidence:'CONFLICT',expected_score_band:'STRONG',tricky_feature:'protocol test only',rationale:'Not an authored gold case',status:'approved'};
const claim=original=>({original,activityPhrase:original.slice(2,-1),timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:'the agreement',quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const candidate=assessCandidate({type:'DIRECT',severity:'HIGH',reasoning:'fixture',claim1:claim('I never signed the agreement.'),claim2:claim('I signed the agreement.')},row.transcript1_text,row.transcript2_text);
const fixture={...row,expected_score_band:candidate.band};
const invariants={pass:true,output:'Unit fixture'};
const response=body=>async()=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
test('all three API attempts are counted and correct single pair passes',async()=>{
  let calls=0;
  const result=await runVerifier({rows:[fixture],invariants,fetchImpl:async(...args)=>{calls++;assert.equal(JSON.parse(args[1].body).transcript1,row.transcript1_text);return response({topicsReviewed:[],contradictions:[candidate]})(...args);}});
  assert.equal(calls,3);assert.equal(result.summary.attemptedRuns,3);assert.equal(result.pass,true);
});
test('empty and extra arrays fail without choosing a matching pair',async()=>{
  for(const contradictions of [[],[candidate,candidate]]){
    const result=await runVerifier({rows:[fixture],invariants,fetchImpl:response({topicsReviewed:[],contradictions})});
    assert.equal(result.pass,false);assert.equal(result.summary.failedAttempts,3);assert.equal(result.cases[0].stable,false);assert.equal(result.cases[0].runs[0].candidates.length,contradictions.length);
  }
});
test('network failures retain all attempts',async()=>{
  const result=await runVerifier({rows:[fixture],invariants,fetchImpl:async()=>{throw new Error('offline');}});
  assert.equal(result.summary.attemptedRuns,3);assert.equal(result.status,'NOT_RUN');assert.equal(result.summary.accuracyPercent,null);assert.equal(result.summary.failedAttempts,null);assert.equal(result.cases[0].stable,null);
});
test('malformed and null JSON responses and HTTP errors count as failed attempts',async()=>{
  for (const fetchImpl of [response(null),async()=>({ok:true,status:200,text:async()=>'<invalid>'}),async()=>({ok:false,status:503,text:async()=>JSON.stringify({error:'unavailable',details:'fixture'})})]) {
    const result=await runVerifier({rows:[fixture],invariants,fetchImpl});
    assert.equal(result.summary.failedAttempts,result.status==='NOT_RUN'?null:3);
    assert.equal(result.summary.passedAttempts,result.status==='NOT_RUN'?null:0);
    assert.equal(result.pass,result.status==='NOT_RUN'?null:false);
    assert.notEqual(result.cases[0].runs[0].rawText,null);
  }
});
test('nonapproved rows are visible and never requested; duplicate IDs fail closed',async()=>{
  const result=await runVerifier({rows:[{...fixture,status:'draft'}],invariants,fetchImpl:()=>assert.fail('must not fetch')});
  assert.equal(result.rejected.length,1);assert.equal(result.pass,false);
  assert.match(validateGold([fixture,fixture]).errors.join(' '),/duplicate ID/);
});
test('missing fields, fabricated grounding and score injection fail',()=>{
  for(const c of [{...candidate,score:11},{...candidate,claim1:{...candidate.claim1,original:42}},{...candidate,claim1:{...candidate.claim1,activityPhrase:'fabricated'}},{...candidate,commitment:null},null])assert.equal(checkResponse({topicsReviewed:[],contradictions:[c]},fixture).pass,false);
});
test('three identical wrong types trigger human review without changing labels',async()=>{
  const result=await runVerifier({rows:[fixture],invariants,fetchImpl:response({topicsReviewed:[],contradictions:[{...candidate,type:'INFERENTIAL'}]})});
  assert.equal(result.cases[0].humanRecheck,true);assert.equal(fixture.expected_type,'DIRECT');
});
test('null score band only belongs to NOT_EVALUABLE and HTML is escaped',()=>{
  assert.match(validateGold([{...fixture,expected_score_band:null}]).errors.join(' '),/exclusive/);
  assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
test('individual metric denominator includes every attempt and rejects extra pairs',async()=>{
  let calls=0;
  const result=await runVerifier({rows:[fixture],invariants,fetchImpl:async()=>response({topicsReviewed:[],contradictions:++calls===1?[candidate]:calls===2?[candidate,candidate]:[]})()});
  // One correct pair plus one extra-pair and one omission: every metric is 1/3.
  assert.equal(result.summary.typeCorrect,1);assert.equal(result.summary.evidenceCorrect,1);assert.equal(result.summary.bandCorrect,1);
  assert.equal(result.summary.typeAccuracyPercent,33.33);assert.equal(result.summary.stabilityPercent,0);
});
test('HTML shows comparisons, score breakdown, and escaped input; immutable archive rejects collisions',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'deposition-unit-report-'));
  try {
    const result=await runVerifier({rows:[fixture],invariants,fetchImpl:response({topicsReviewed:[],contradictions:[candidate]})});
    await writeReports(result,directory);
    const html=await readFile(join(directory,'report.html'),'utf8');
    assert.match(html,/Type accuracy/);assert.match(html,/Expected<\/th><th>Actual/);assert.match(html,/Evidence E/);assert.match(html,/Human verified: Y/);assert.match(html,/beforeprint/);
    assert.ok(html.includes(`'independent-verifier:'+${JSON.stringify(result.createdAt)}+':'+e.dataset.note`),'Local notes must be scoped to this report timestamp');
    const raw=await readFile(result.archive.resultsPath,'utf8');
    assert.equal(JSON.parse(raw).summary.attemptedRuns,3);
    await assert.rejects(writeReports(result,directory),{code:'EEXIST'});
    assert.equal(await readFile(result.archive.resultsPath,'utf8'),raw);
    const empty=await runVerifier({rows:[],invariants,fetchImpl:()=>assert.fail('Empty gold must not fetch')});
    for(const key of ['accuracyPercent','typeAccuracyPercent','evidenceAccuracyPercent','bandAccuracyPercent','stabilityPercent'])assert.equal(empty.summary[key],null);
    await writeReports(empty,join(directory,'empty'));
    const emptyHTML=await readFile(join(directory,'empty','report.html'),'utf8');
    assert.match(emptyHTML,/<strong>N\/A<\/strong>/);
    assert.doesNotMatch(emptyHTML,/<strong>0%<\/strong>/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('provisional band-only mismatch passes without human recheck',async()=>{
  const result=await runVerifier({rows:[{...fixture,expected_score_band:'MODERATE'}],invariants,fetchImpl:response({topicsReviewed:[],contradictions:[candidate]})});
  assert.equal(result.pass,true);assert.equal(result.cases[0].humanRecheck,false);
  const checked=result.cases[0].runs[0].candidates[0];
  assert.equal(checked.typeMatch,true);assert.equal(checked.bandMatch,false);assert.deepEqual(checked.errors,[]);assert.match(checked.informational.join(' '),/Provisional/);
});
test('rule-dependent TYPE_ONLY evidence permits NOT_EVALUABLE and excludes evidence denominator',async()=>{
  const protocol={...fixture,transcript1_text:'Maybe I never signed the agreement.',expected_evidence:'depends on implemented rules',review_policy:{band_assertion:'informational',evidence_assertion:'informational',approval_scope:'TYPE_ONLY'}};
  const c=assessCandidate({...candidate,claim1:{...candidate.claim1,original:protocol.transcript1_text,activityPhrase:protocol.transcript1_text}},protocol.transcript1_text,protocol.transcript2_text);
  assert.equal(c.status,'NOT_EVALUABLE');assert.deepEqual(validateGold([protocol]).errors,[]);
  const result=await runVerifier({rows:[protocol],invariants,fetchImpl:response({topicsReviewed:[],contradictions:[c]})});
  assert.equal(result.pass,true);assert.equal(result.summary.evidenceCheckedAttempts,0);assert.equal(result.summary.evidenceUncheckedAttempts,3);assert.equal(result.summary.evidenceAccuracyPercent,null);
  assert.ok(validateGold([{...protocol,review_policy:{...protocol.review_policy,approval_scope:'FULL'}}]).errors.length);
  assert.ok(validateGold([{...protocol,review_policy:{...protocol.review_policy,evidence_assertion:'required'}}]).errors.length);
});
test('positive supported conflict fails for expected or actual FALSE_POSITIVE even with informational evidence',()=>{
  for(const [actual,expected] of [[candidate,'FALSE_POSITIVE'],[{...candidate,type:'FALSE_POSITIVE'},'DIRECT']]) {
    const checked=checkResponse({topicsReviewed:[],contradictions:[actual]},{...fixture,expected_type:expected});
    assert.equal(checked.pass,false);assert.match(checked.errors.join(' '),/FALSE_POSITIVE/);
  }
});
test('band instability is informational while type stability is required',async()=>{
  const protocol={...fixture,transcript1_text:'Maybe I never signed the agreement.',review_policy:{band_assertion:'informational',evidence_assertion:'informational',approval_scope:'TYPE_ONLY'}};
  const low=assessCandidate({...candidate,claim1:{...candidate.claim1,original:protocol.transcript1_text,activityPhrase:protocol.transcript1_text}},protocol.transcript1_text,protocol.transcript2_text);
  const high=assessCandidate(candidate,protocol.transcript1_text,protocol.transcript2_text);
  let n=0;
  const result=await runVerifier({rows:[protocol],invariants,fetchImpl:async()=>response({topicsReviewed:[],contradictions:[++n===2?low:high]})()});
  assert.equal(result.pass,true);assert.equal(result.cases[0].typeStable,true);assert.equal(result.cases[0].bandStable,false);assert.equal(result.cases[0].humanRecheck,false);
});
// Synthetic transport objects exercise ordinal aggregation only, not gold expectations.
const ordinalCase=(id,role,scores,pattern='time')=>({row:{id,review_policy:{ordinal_pattern:pattern,ordinal_role:role}},pass:true,ordinalErrors:[],runs:scores.map((score,i)=>({run:i+1,httpStatus:200,errors:[],candidates:[{candidate:{type:role==='EXACT_DIRECT'?'DIRECT':'INFERENTIAL',score,status:'CONFLICT_SUPPORTED',rulesFired:[{id:pattern,verdict:'CONFLICT'}]}}]}))});
test('ordinal checks every cross-attempt pair sharing explicit fired pattern and fails both cases',()=>{
  const good=[ordinalCase('exact','EXACT_DIRECT',[80,90]),ordinalCase('approx','APPROXIMATE_INFERENTIAL',[50,70])];
  const passed=checkOrdinal(good);assert.equal(passed.status,'PASS');assert.equal(passed.comparisons.length,4);
  const bad=[ordinalCase('exact','EXACT_DIRECT',[60,90]),ordinalCase('approx','APPROXIMATE_INFERENTIAL',[50,70])];
  const failed=checkOrdinal(bad);assert.equal(failed.status,'FAIL');assert.equal(failed.failed,1);assert.ok(bad.every(c=>!c.pass&&c.ordinalErrors.length===1));
});
test('ordinal reports explicit skip for absent matches, unrelated patterns and unscored/invalid output',()=>{
  for(const cases of [[],[ordinalCase('only','EXACT_DIRECT',[80])],[ordinalCase('a','EXACT_DIRECT',[80]),ordinalCase('b','APPROXIMATE_INFERENTIAL',[70],'quantity')]])assert.equal(checkOrdinal(cases).status,'SKIPPED');
  for(const mutate of [c=>c.runs[0].errors.push('Deterministic provenance mismatch: score'),c=>c.runs[0].candidates[0].candidate.score=null,c=>c.runs[0].candidates[0].candidate.rulesFired=[]]){
    const a=ordinalCase('a','EXACT_DIRECT',[80]),b=ordinalCase('b','APPROXIMATE_INFERENTIAL',[70]);mutate(a);
    const result=checkOrdinal([a,b]);assert.equal(result.status,'SKIPPED');assert.match(result.skips[0].reason,/Unscored\/invalid/);
  }
});


test('connection refused aborts immediately and writes diagnostic header without accuracy results',async()=>{
  let calls=0;
  const result=await runVerifier({rows:[fixture,{...fixture,id:'unattempted'}],invariants,fetchImpl:async()=>{calls++;throw new TypeError('fetch failed',{cause:Object.assign(new Error('refused'),{code:'ECONNREFUSED'})});}});
  assert.equal(calls,1);assert.equal(result.status,'NOT_RUN');assert.equal(result.pass,null);
  assert.equal(result.notRunMessage,'NOT RUN: server unreachable (1/1 requests failed). No accuracy results.');
  assert.equal(result.availability.unattemptedRequests,5);assert.equal(result.summary.failedAttempts,null);
  assert.ok(result.cases.every(c=>c.pass===null&&c.runs.every(r=>r.pass===null)));
  const directory=await mkdtemp('/private/tmp/verifier-unreachable-');
  try {
    await writeReports(result,directory);
    const html=await readFile(join(directory,'report.html'),'utf8');
    assert.match(html,/<header><h1>NOT RUN: server unreachable \(1\/1 requests failed\). No accuracy results.<\/h1><\/header>/);
    assert.doesNotMatch(html,/Type accuracy|0%|Expected<\/th><th>Actual/);
    assert.equal(JSON.parse(await readFile(join(directory,'results.json'),'utf8')).summary.typeAccuracyPercent,null);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('fewer than half successful requests suppresses even previously valid case results',async()=>{
  let n=0;
  const result=await runVerifier({rows:[fixture],invariants,fetchImpl:async()=>++n===1?response({topicsReviewed:[],contradictions:[candidate]})():{ok:false,status:503,text:async()=>'unavailable'}});
  assert.equal(result.status,'NOT_RUN');assert.equal(result.notRunMessage,'NOT RUN: server unreachable (2/3 requests failed). No accuracy results.');
  assert.equal(result.summary.passedAttempts,null);assert.equal(result.summary.failedAttempts,null);
  assert.equal(result.cases[0].runs[0].pass,null);assert.equal(result.cases[0].humanRecheck,false);
});
test('exactly half successful requests is not an unreachable run; unavailable requests stay ungraded',async()=>{
  let n=0;
  const result=await runVerifier({rows:[fixture],runs:2,invariants,fetchImpl:async()=>++n===1?response({topicsReviewed:[],contradictions:[candidate]})():{ok:false,status:503,text:async()=>'unavailable'}});
  assert.equal(result.status,'COMPLETED');assert.equal(result.summary.evaluatedRuns,1);assert.equal(result.summary.requestFailures,1);
  assert.equal(result.summary.passedAttempts,1);assert.equal(result.summary.failedAttempts,0);assert.equal(result.summary.typeAccuracyPercent,100);
  assert.equal(result.cases[0].pass,null);assert.equal(result.cases[0].runs[1].pass,null);assert.equal(result.pass,false);
});
