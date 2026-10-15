import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressCounts, remainingLabel, friendlyFailure, durationLabel } from './analysisStatus.js';
const running = { status: 'running', planned: 6, completed: 1, failed: 0 };
test('estimate waits for a completed comparison and counts down from measured work', () => {
 assert.equal(remainingLabel(running,true,30,null),'Calculating time remaining…');
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
 assert.deepEqual(progressCounts({...running,failed:2}),{total:6,completed:1,failed:2,processed:3});
 assert.deepEqual(progressCounts({planned:2,completed:2,failed:7}),{total:2,completed:2,failed:0,processed:2});
});
test('failure messages are readable and never leak raw provider text', () => {
 assert.match(friendlyFailure('Model did not finish normally (max_tokens); response is incomplete.'),/could not be read completely/);
 assert.equal(friendlyFailure('SECRET raw payload'),'This comparison could not be completed.');
 assert.equal(durationLabel(null),'—');
});
