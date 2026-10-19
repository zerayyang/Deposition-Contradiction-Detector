import test from 'node:test';
import assert from 'node:assert/strict';
import {textQuoteMap,groundPdfClaim} from '../../server/pdfQuoteGrounding.js';
import {buildPlan,executePlan} from '../../server/documentAnalysis.js';

// Fictional pasted transcripts with reporting layout.
const header='R. Smith - by Plaintiff - Direct';
const page=(n,body)=>`${header}\n\n${n}\n${body}\nkjr\n`;
const pasted=page(101,'Q Where were you that night?\nA I stayed at the warehouse until')+page(102,'about nine and then I went home.\nQ Anything else?\nA No.')+page(103,'Q Did you call anyone?\nA No, I did not.');
const numbered='1 Q Where were you?\n2 A I stayed at the\n3 warehouse until nine.\n4 Q Then?\n5 A I went home.';
const section=text=>({text,start:0,end:text.length});

test('a quote that skips running headers, page numbers and initials maps to the exact original text',()=>{
  const map=textQuoteMap(pasted);
  const r=groundPdfClaim({original:'I stayed at the warehouse until about nine and then I went home.'},pasted,map,section(pasted),'TEXT_LAYOUT_MAPPED');
  assert.equal(r.audit.method,'TEXT_LAYOUT_MAPPED');
  assert.ok(pasted.includes(r.claim.original),'the shown quote is literal source text');
  assert.match(r.claim.original,/^I stayed at the warehouse until\n[\s\S]*about nine and then I went home\.$/);
});
test('line numbers inside a quote are skipped only in a confirmed numbered run',()=>{
  const r=groundPdfClaim({original:'I stayed at the warehouse until nine.'},numbered,textQuoteMap(numbered),section(numbered),'TEXT_LAYOUT_MAPPED');
  assert.equal(r.claim.original,'I stayed at the\n3 warehouse until nine.');
  assert.ok(!textQuoteMap('Q How many?\nA 3 boxes.').normalized.startsWith('Q How many? A boxes'),'a lone number is testimony, not a line number');
});
test('no fuzzy matching: changed words, invented words and ambiguous quotes are still refused',()=>{
  const map=textQuoteMap(pasted);
  assert.throws(()=>groundPdfClaim({original:'I stayed at the warehouse until about ten.'},pasted,map,section(pasted),'TEXT_LAYOUT_MAPPED'),/outside its submitted section/);
  const twice='Q Then?\nA I went\nhome.\nQ Again?\nA I went\nhome.';
  assert.throws(()=>groundPdfClaim({original:'I went home.'},twice,textQuoteMap(twice),section(twice),'TEXT_LAYOUT_MAPPED'),/more than one source passage/);
});
test('analysis keeps a finding whose pasted quote crossed a page break instead of dropping it',async()=>{
  const other='Q Where were you that night?\nA I was home all evening.';
  const plan=buildPlan([pasted,other],[],'Fictional rules.');
  const finding={type:'DIRECT',reasoning:'Fictional.',claim1:{original:'I stayed at the warehouse until about nine and then I went home.'},claim2:{original:'I was home all evening.'}};
  const result=await executePlan({plan,texts:[pasted,other],instructions:'Fictional rules.',callModel:async()=>({stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},
    content:[{type:'text',text:JSON.stringify({topicsReviewed:['night'],contradictions:[finding]})}]})});
  assert.equal(result.contradictions.length,1);assert.equal(result.analysis.tasks[0].rejectedFindings.length,0);
  assert.ok(pasted.includes(result.contradictions[0].claim1.original));
});
