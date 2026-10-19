import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareConfidence} from '../../server/confidence/handlers.js';
import {buildPdfReport} from '../../src/lib/pdfReport.js';

// Fictional testimony only: the question about the topic is split over two turns.
const texts=['Q. Do you know if the rules allow counting goodwill --\nA. I think they do.\nQ. Next topic.\nA. Sure.',
  'Q. Do you know if the rules allow counting goodwill --\nA. I don\'t know.\nQ. -- in an annual summary?\nA. Don\'t know.\nQ. Okay.\nA. Fine.'];
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const finding={type:'FALSE_POSITIVE',claim1:claim('I think they do.'),claim2:claim("Don't know.")};

test('every check gets the same neutral task; only the order of the statements changes',()=>{
  const p=prepareConfidence({finding,texts});
  const bodies=Array.from({length:7},(_,i)=>JSON.parse(p.requestFor(i).messages[0].content));
  assert.equal(new Set(bodies.slice(0,6).map(b=>b.task)).size,1,'one task for all six votes');
  assert.doesNotMatch(bodies[0].task+bodies[6].task,/reconciliation first|Do not assume a conflict\./);
  assert.equal(bodies[0].statements[0].quote,'I think they do.');assert.equal(bodies[1].statements[0].quote,"Don't know.",'second check shows them in the other order');
  assert.match(bodies[6].task,/Do not assume either a conflict or a reconciliation/);
});
test('a check sees the questions around a short answer, so it knows what it refers to',()=>{
  const p=prepareConfidence({finding,texts});
  const second=JSON.parse(p.requestFor(0).messages[0].content).statements[1];
  assert.equal(second.question,'-- in an annual summary?');
  assert.match(second.earlier,/Do you know if the rules allow counting goodwill/);assert.match(second.later,/Okay\./);
});
test('the PDF shows a dash, not an older-style number, when confidence was not checked',()=>{
  const html=buildPdfReport({draft:{results:[{type:'DIRECT',humanConfidence:81,headline:'Unchecked',claim1:claim('a b c'),claim2:claim('d e f')}]},options:{scope:'everything'}});
  assert.match(html,/<span class="score">—<\/span>/);assert.doesNotMatch(html,/<span class="score">81<\/span>/);
});
