import test from 'node:test';
import assert from 'node:assert/strict';
import {predictedLabel,gradeRun} from './grade.mjs';

test('the strongest raised label is the prediction; nothing raised means FALSE_POSITIVE',()=>{
 assert.equal(predictedLabel([]),'FALSE_POSITIVE');
 assert.equal(predictedLabel([{type:'FALSE_POSITIVE'},{type:'INFERENTIAL'}]),'INFERENTIAL');
 assert.equal(predictedLabel([{type:'INFERENTIAL'},{type:'DIRECT'}]),'DIRECT');
});
test('grading skips debatable and incomplete cases and counts misses and false alarms',()=>{
 const refs=[{id:'a',label:'DIRECT'},{id:'b',label:'FALSE_POSITIVE'},{id:'c',label:'DEBATABLE'},{id:'d',label:'DIRECT'},{id:'e',label:'DIRECT'}];
 const results={summaries:[
  {id:'a',phase:'direct',status:'complete',labels:[{type:'DIRECT'}]},
  {id:'b',phase:'direct',status:'complete',labels:[{type:'INFERENTIAL'}]},
  {id:'c',phase:'direct',status:'complete',labels:[]},
  {id:'d',phase:'direct',status:'complete',labels:[]},
  {id:'e',phase:'direct',status:'failed',labels:[]},
  {id:'a',phase:'extraction',status:'awaiting_comparison'}]};
 const {summary}=gradeRun(results,refs);
 assert.equal(summary.graded,3);assert.equal(summary.correct,1);
 assert.equal(summary.missedContradictions,1);assert.equal(summary.falseAlarms,1);
 assert.equal(summary.incomplete,1);assert.deepEqual(summary.debatable,[{id:'c',predicted:'FALSE_POSITIVE'}]);
});
