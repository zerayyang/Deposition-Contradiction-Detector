import test from 'node:test';
import assert from 'node:assert/strict';
import {detectEvidence,polarity,commitmentOf} from '../../server/scoring/detectors.js';

// Fictional testimony only. Each detector must fire on its pattern and stay quiet otherwise.
const pair=(question1,answer1,question2,answer2)=>({question1,answer1,question2,answer2});
const ids=r=>r.fired.map(f=>`${f.id}:${f.verdict}`);

test('1. same question answered yes and no',()=>{
 const r=detectEvidence(pair('Did you see him that night?','Yes.','Did you see him that night?','No, I did not.'));
 assert.equal(r.status,'CONFLICT');assert.deepEqual(ids(r),['same-question-yes-no:CONFLICT']);
 assert.equal(detectEvidence(pair('Did you see him that night?','Yes.','Did you see him that night?','Yes, I did.')).status,'COMPATIBLE');
 assert.equal(detectEvidence(pair('Did you see him that night?','Yes.','Did you pay the invoice in March?','No.')).status,'NOT_EVALUABLE','different questions are not compared');
 assert.equal(polarity("That's correct."),'YES');assert.equal(polarity("I didn't."),'NO');assert.equal(polarity('Probably around eight.'),null);
});
test('2. the same statement affirmed and negated',()=>{
 assert.deepEqual(ids(detectEvidence(pair('','I signed the lease.','','I never signed the lease.'))),['negation-flip:CONFLICT']);
 assert.equal(detectEvidence(pair('','I signed the lease.','','I paid the rent in cash.')).status,'NOT_EVALUABLE','unrelated statements do not fire');
 assert.equal(detectEvidence(pair('','I did not sign the lease.','','I never signed the lease.')).status,'NOT_EVALUABLE','both negated is agreement, not a flip');
});
test('3. an exhaustive answer versus an added person',()=>{
 const r=detectEvidence(pair('Who said it?',"That I've heard it's just them.",'What did Campo say?','Campo said it to me almost every day.'));
 assert.deepEqual(ids(r),['exhaustive-exception:CONFLICT']);
 assert.equal(detectEvidence(pair('Who was there?','Just my brother.','What did you eat?','We had pasta.')).status,'NOT_EVALUABLE','no new person or item named');
});
test('4. times and quantities compared by the parsers',()=>{
 assert.equal(detectEvidence(pair('When?','I left at 8 PM.','When?','I left at 11 PM.')).evidence,1);
 assert.equal(detectEvidence(pair('When?','I left around 8 PM.','When?','I left at 8:15 PM.')).status,'COMPATIBLE');
 assert.equal(detectEvidence(pair('How many?','I think three or four cars.','How many?','We had 9 cars.')).evidence,0.7);
 assert.equal(detectEvidence(pair('How many?','Three cars.','How much?','9 dollars.')).status,'NOT_EVALUABLE','different units are not compared');
});
test('5. commitment uses the owner word lists; the score formula is unchanged',()=>{
 assert.equal(commitmentOf('I went out.'),0.8);assert.ok(commitmentOf('I think I went out.')<0.8);
 assert.ok(commitmentOf("I don't remember.")<commitmentOf('I think I went out.'));assert.ok(commitmentOf('I definitely went out.')>0.8);
 const firm=detectEvidence(pair('Did you see him?','Yes, definitely.','Did you see him?','No.'));
 const hedged=detectEvidence(pair('Did you see him?','Yes, I think so.','Did you see him?','No.'));
 assert.ok(firm.score>hedged.score);assert.equal(firm.score,Math.round(100*0.95*(0.5+0.5*firm.commitment)));
});
