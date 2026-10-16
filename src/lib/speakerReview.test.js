import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSpeakerChoices,confirmedSpeakerRoles} from './speakerReview.js';
const docs=[{labels:['MR. REED','MS. VALE'],hasAnswers:true,hasQuestions:true},{labels:['PRESIDENT RIVER','MS. LANE'],hasAnswers:false,hasQuestions:false}];
test('batch confirmation uses existing Q/A syntax but never guesses a named witness',()=>{
 const choices=initialSpeakerChoices(docs);assert.equal(choices[0].witness,'__QA__');assert.equal(choices[1].witness,'');assert.throws(()=>confirmedSpeakerRoles(docs,choices),/Choose who gives testimony/);
 choices[1]={witness:'PRESIDENT RIVER',questioner:'MS. LANE'};
 assert.deepEqual(confirmedSpeakerRoles(docs,choices),[{'MR. REED':'OTHER','MS. VALE':'OTHER'},{'PRESIDENT RIVER':'WITNESS','MS. LANE':'QUESTIONER'}]);
 assert.deepEqual(docs[0].labels,['MR. REED','MS. VALE']);
});
test('unlisted choices and overlapping named witness/questioner assignments are rejected',()=>{
 const choices=[{witness:'INVENTED',questioner:'__QA__'},{witness:'PRESIDENT RIVER',questioner:'MS. LANE'}];assert.throws(()=>confirmedSpeakerRoles(docs,choices),/listed/);
 choices[0]={witness:'MR. REED',questioner:'MR. REED'};assert.throws(()=>confirmedSpeakerRoles(docs,choices),/both witness/);
});
