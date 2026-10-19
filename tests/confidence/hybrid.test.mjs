import test from 'node:test';
import assert from 'node:assert/strict';
import {FEATURE_NAMES, HYBRID_VERSION, summarizeConfidence, hybridBadge} from '../../shared/hybridConfidence.js';
import {reviewConfidence} from '../../server/confidence/review.js';

const input = () => ({originalType: 'DIRECT', evidence: {sourcesVerified: true, ruleSupported: true, ruleStrength: 1},
  reviewer: {status: 'SUCCESS', type: 'DIRECT', objections: []},
  votes: Array.from({length: 6}, (_, i) => ({model: i < 3 ? 'a' : 'b', permutation: i % 3, status: 'SUCCESS', type: i === 5 ? 'INFERENTIAL' : 'DIRECT'}))});
test('five of six feeds a clearly experimental combined index', () => {
  const r = summarizeConfidence(input());
  assert.equal(r.agreement, 5 / 6); assert.equal(r.score,90);assert.equal(r.scoreKind,'EXPERIMENTAL_INDEX');assert.equal(r.combination.trained,false);assert.equal(r.status,'EXPERIMENTAL');
});
test('invalid sources block even unanimous votes', () => {
  const i = input(); i.evidence.sourcesVerified = false;
  assert.equal(summarizeConfidence(i).status, 'SOURCE_REVIEW_REQUIRED');
});
test('failed votes, duplicate slots and missing reviewer cannot produce a score', () => {
  for (const mutate of [i => {i.votes[0].status = 'FAILED';}, i => {i.votes[1] = i.votes[0];}, i => {delete i.reviewer;}, i => {i.votes.pop();}]) {
    const i = input(); mutate(i); const r = summarizeConfidence(i);
    assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.score, null);
  }
});
test('code applies supplied calibration coefficients; malformed configuration rejected', () => {
  const i = input();
  // Synthetic coefficients exercise arithmetic only, not a production accuracy claim.
  i.calibration = {version: HYBRID_VERSION, target: 'ORIGINAL_TYPE_CORRECT', datasetId: 'synthetic-test-only',
    featureNames: FEATURE_NAMES, intercept: -1, weights: [3, 0.5, -1, 0.25, 0.25]};
  assert.equal(summarizeConfidence(i).score, 92);
  i.calibration.weights = [3]; assert.equal(summarizeConfidence(i).status, 'INVALID_CALIBRATION');
});
test('display never presents legacy evidence numbers as hybrid confidence', () => {
  assert.equal(hybridBadge({type: 'DIRECT', humanConfidence: 90}).value, '—');
  const c = {version: HYBRID_VERSION, status: 'CALIBRATED', originalType: 'DIRECT', score: 92};
  assert.equal(hybridBadge({type: 'DIRECT', hybridConfidence: c}).value, '92%');
  assert.equal(hybridBadge({type: 'FALSE_POSITIVE', hybridConfidence: c}).value, '—');
  assert.equal(hybridBadge({type: 'DIRECT', hybridConfidence: c, labelDisagreement: true}).value, '—');
});
test('seven mocked reviews neither alter findings nor disclose votes or label to reviewers', async () => {
  const finding = {type: 'DIRECT', humanConfidence: 90}; const before = structuredClone(finding); let calls = 0;
  const result = await reviewConfidence({finding, evidence: input().evidence, models: ['a', 'b'], context: {pair: 'synthetic'},
    classify: async request => {calls++; assert.equal(request.originalType, undefined); assert.equal(request.votes, undefined); return {type: 'DIRECT'};},
    review: async request => {calls++; assert.equal(request.votes, undefined); return {type: 'DIRECT', objections: []};}});
  assert.equal(calls, 7); assert.deepEqual(finding, before); assert.equal(result.score,100);
});
test('source failure makes zero calls and cancellation stops further work', async () => {
  let calls = 0; const controller = new AbortController();
  const options = {finding: {type: 'DIRECT'}, models: ['a', 'b'], context: {}, signal: controller.signal,
    classify: async () => {calls++; controller.abort(); throw new Error('abort');}, review: async () => {calls++;}};
  await reviewConfidence({...options, evidence: {sourcesVerified: false}}); assert.equal(calls, 0);
  await assert.rejects(reviewConfidence({...options, evidence: input().evidence})); assert.equal(calls, 1);
});
test('a failed transport is visible and never automatically retried', async () => {
  let calls = 0;
  const r = await reviewConfidence({finding: {type: 'DIRECT'}, models: ['a', 'b'], context: {}, evidence: input().evidence,
    classify: async () => {calls++; throw new Error('synthetic');}, review: async () => ({type: 'DIRECT', objections: []})});
  assert.equal(calls, 6); assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.score, null);
});

test('reviewer disagreement, concerns and code evidence each influence the combined index',()=>{
  const i=input();assert.equal(summarizeConfidence(i).score,90);
  i.reviewer.objections=['Context needs review'];assert.equal(summarizeConfidence(i).score,80);
  i.reviewer.type='FALSE_POSITIVE';assert.equal(summarizeConfidence(i).score,70);
  i.evidence={sourcesVerified:true,status:'COMPATIBLE_SUPPORTED',ruleStrength:0};assert.equal(summarizeConfidence(i).score,50);
});
test('unsupported code is excluded explicitly and compatibility supports a false-positive category',()=>{
  const i=input();i.evidence={sourcesVerified:true,status:'NOT_EVALUABLE',ruleStrength:0};
  const r=summarizeConfidence(i);assert.equal(r.score,88);assert.equal(r.combination.code.points,null);assert.equal(r.combination.availablePoints,80);
  i.originalType='FALSE_POSITIVE';i.reviewer={status:'SUCCESS',type:'FALSE_POSITIVE',objections:[]};
  i.votes=i.votes.map(v=>({...v,type:'FALSE_POSITIVE'}));i.evidence.status='COMPATIBLE_SUPPORTED';
  assert.equal(summarizeConfidence(i).score,100);assert.equal(summarizeConfidence(i).combination.code.points,20);
});

test('a low score follows disagreement rather than being raised for appearance',()=>{
  const i=input();i.votes=i.votes.map((v,n)=>({...v,type:n<2?'DIRECT':'FALSE_POSITIVE'}));
  i.reviewer={status:'SUCCESS',type:'FALSE_POSITIVE',objections:['The original category is unsupported.']};
  i.evidence={sourcesVerified:true,status:'NOT_EVALUABLE',ruleStrength:0};
  const r=summarizeConfidence(i);assert.equal(r.score,25);assert.equal(r.combination.permutation.points,20);assert.equal(r.combination.reviewer.points,0);
});
