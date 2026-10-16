import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressCounts, remainingLabel, friendlyFailure, durationLabel, elapsedLabel } from './analysisStatus.js';
const running = { status: 'running', planned: 6, completed: 1, failed: 0 };
test('estimate waits for a completed comparison and counts down from measured work', () => {
 assert.equal(remainingLabel(running,true,30,null),'Waiting for the first comparison to estimate remaining time…');
 assert.equal(remainingLabel(running,true,60,{processed:1,elapsed:60}),'About 5 min remaining');
 assert.equal(remainingLabel(running,true,120,{processed:1,elapsed:60}),'About 4 min remaining');
 assert.equal(remainingLabel(running,true,400,{processed:1,elapsed:60}),'Taking longer than estimated…');
});
test('terminal and inactive states never show a countdown', () => {
 for(const status of ['complete','partial','cancelled','failed']) assert.equal(remainingLabel({...running,status},true,20,{processed:1,elapsed:10}),null);
 assert.equal(remainingLabel(running,false,20,{processed:1,elapsed:10}),null);
 assert.equal(remainingLabel({...running,completed:6},true,20,null),'Finishing up…');
});
test('failures advance progress without becoming successful comparisons', () => {
 assert.deepEqual(progressCounts({...running,failed:2}),{total:6,completed:1,failed:2,partial:0,processed:3});
 assert.deepEqual(progressCounts({planned:2,completed:2,failed:7}),{total:2,completed:2,failed:0,partial:0,processed:2});
});
test('failure messages are readable and never leak raw provider text', () => {
 assert.match(friendlyFailure('Model did not finish normally (max_tokens); response is incomplete.'),/output limit/);
 assert.equal(friendlyFailure('SECRET raw payload'),'This comparison could not be completed.');
 assert.equal(durationLabel(null),'—');
});

test('partial comparisons advance processed count without inflating successful coverage', () => {
 assert.deepEqual(progressCounts({planned:6,completed:1,failed:2,partial:2}),{total:6,completed:1,failed:2,partial:2,processed:5});
});

test('elapsed time shows seconds instead of rounding minutes upward',()=>{ assert.equal(elapsedLabel(33),'33s'); assert.equal(elapsedLabel(374.5),'6m 14s'); assert.equal(elapsedLabel(3601),'1h 0m 1s'); assert.equal(elapsedLabel(null),'Unavailable'); });
test('resumed ETA uses only newly measured work and remaining comparisons, not old completions',()=>{
 const analysis={status:'running',planned:6,completed:5,failed:0,partial:0};
 assert.match(remainingLabel(analysis,true,60,{processed:5,processedThisRun:1,remaining:1,elapsed:60}),/About 1 min remaining/);
 assert.match(remainingLabel({...analysis,completed:4},true,1,{processed:4,processedThisRun:0,remaining:2,elapsed:1}),/Waiting for the first comparison/);
});
