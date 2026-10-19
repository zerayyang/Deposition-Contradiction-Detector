import test from 'node:test';
import assert from 'node:assert/strict';
import {testimonyMarkers,requireWitnessInput} from '../../server/testimonyMarkers.js';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {resolveWitnessSource} from '../../server/sourceEvidence.js';
import {prepareConfidence,createConfidenceHandlers} from '../../server/confidence/handlers.js';

// Fictional inputs only. Expected behavior: docs/bare-qa-confidence.md.
const texts=[
  'Synthetic hearing\r\nQ Did you sign the sample?\r\nA I signed the sample.\r\nMR. EXAMPLE: That is a question from counsel.\r\nTHE COURT: Continue.\r\nSource: synthetic reference',
  'Q: Did you sign the sample?\nA: I did not sign the sample.',
];
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding={type:'DIRECT',claim1:claim('I signed the sample.'),claim2:claim('I did not sign the sample.')};
async function allowance(body,options={}) {
  let calls=0;
  const handler=createConfidenceHandlers({callModel:async()=>{calls++;throw Error('Forbidden paid call');},...options});
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
  await handler.allowance({identity:{id:'synthetic-owner'},body},res);
  return {res,calls};
}
test('bare Q/A retains literal offsets, governing question and courtroom/metadata boundaries',()=>{
  const before=texts[0],parsed=parseTestimonySource(before);
  requireWitnessInput(before);
  const answers=parsed.turns.filter(t=>t.role==='WITNESS');
  assert.equal(answers.length,1);
  assert.equal(before.slice(answers[0].contentStart,answers[0].end).trim(),finding.claim1.original);
  assert.equal(answers[0].question.text,'Did you sign the sample?');
  for(const turn of parsed.turns.filter(t=>t.role==='OTHER'))assert.notEqual(turn.role,'WITNESS');
  assert.equal(parsed.turns.filter(t=>t.role==='OTHER').length,3);
  const binding=resolveWitnessSource(before,finding.claim1);
  assert.equal(binding.status,'BOUND');assert.equal(binding.selected.answer,finding.claim1.original);
  assert.equal(texts[0],before);
});
test('free allowance and exact-source confidence planning accept bare Q/A without a paid call',async()=>{
  const {res,calls}=await allowance({caseId:'synthetic',texts});
  assert.equal(res.statusCode,200);assert.equal(calls,0);assert.ok(res.body.budgetUsd>0);
  const plan=prepareConfidence({finding,texts});assert.equal(plan.evidence.sourcesVerified,true);
  assert.throws(()=>prepareConfidence({finding:{...finding,claim1:claim('That is a question from counsel.')},texts}),/SOURCE_REVIEW_REQUIRED/);
});
test('isolated prose A and named/metadata interruptions do not become witness answers',()=>{
  assert.equal(testimonyMarkers('Q fever was discussed.').length,0);
  for(const text of ['A person wrote a synthetic note.','MR. EXAMPLE: Synthetic lawyer words.\nA standalone heading.',
    'Q What happened?\nMR. EXAMPLE: New instruction.\nA standalone heading.',
    'Q What happened?\nSource: synthetic footer\nA standalone heading.']) {
    assert.equal(testimonyMarkers(text).filter(m=>m.role==='A').length,0);
  }
  assert.throws(()=>requireWitnessInput('A person wrote a synthetic note.'),/WITNESS_CONFIRMATION_REQUIRED/);
});
test('mixed punctuation and numbered labels keep their existing witness framing',()=>{
  for(const text of ['Q: Synthetic question?\nA Synthetic answer.','Q Synthetic question?\nA: Synthetic answer.',
    '1 Q Synthetic question?\n2 A Synthetic answer.']) {
    const answers=parseTestimonySource(text).turns.filter(t=>t.role==='WITNESS');
    assert.equal(answers.length,1);assert.equal(answers[0].question.text,'Synthetic question?');
  }
});
test('allowance errors expose safe reason codes and recovery instructions, never source payloads',async()=>{
  for(const [text,code] of [['Private synthetic prose','WITNESS_CONFIRMATION_REQUIRED'],
    ['Q: Synthetic question only?','NO_WITNESS_ANSWERS'],
    ['Q: Synthetic?\nA: '+ 'x'.repeat(21000),'CONFIDENCE_CONTEXT_LIMIT']]) {
    const {res,calls}=await allowance({caseId:'synthetic',texts:[text,texts[1]]});
    assert.equal(res.statusCode,400);assert.equal(res.body.code,code);assert.equal(calls,0);
    assert.match(res.body.error,/No paid calls started/);assert.ok(!JSON.stringify(res.body).includes(text));
  }
  const {res}=await allowance({caseId:'synthetic',texts},{storeForRequest:()=>({authorize:async()=>{throw Error('SECRET_PAYLOAD');}})});
  assert.equal(res.body.code,'ALLOWANCE_UNAVAILABLE');assert.doesNotMatch(res.body.error,/SECRET_PAYLOAD/);
  assert.match(res.body.error,/saved case access/);
});
