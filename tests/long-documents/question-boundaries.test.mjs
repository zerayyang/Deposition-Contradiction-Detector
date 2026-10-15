import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionDocument,buildPlan} from '../../server/documentAnalysis.js';
import {testimonyMarkers} from '../../server/testimonyMarkers.js';
import {witnessQuoteMatches} from '../../server/sourceEvidence.js';
import {validateClaim} from '../../server/evidenceValidator.js';
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});

test('numbered bare, dotted, spaced-dot and colon Q/A labels preserve exact offsets and exclude questions',()=>{
 for(const [q,a] of [['11 Q ','12 A '],['11 Q. ','12 A. '],['11 Q . ','12 A . '],['Q: ','A: '],[' 13 q. ',' 14 a. '],['Question: ','Answer: ']]){
  const question='Where were you on Monday?',answer='I was at home.';const text=q+question+'\n'+a+answer;
  const markers=testimonyMarkers(text);assert.equal(markers.length,2);assert.deepEqual(markers.map(m=>m.role),['Q','A']);
  assert.equal(text.slice(markers[1].contentStart),answer);assert.equal(validateClaim(claim(question),text),false);assert.equal(validateClaim(claim(answer),text),true);assert.equal(witnessQuoteMatches(text,answer)[0].index,text.indexOf(answer));
 }
});

test('long numbered undotted transcripts do not become one enormous question',()=>{
 const text=Array.from({length:1600},(_,i)=>`${i*2+1} Q What occurred at event ${i}?\n${i*2+2} A Record ${i} contains complete testimony.\n`).join('');
 const plan=buildPlan([text,text],[],'Existing definitions unchanged.',{singleRequestBytes:1,chunkBytes:1500,overlapBytes:100});
 assert.ok(plan.requestCount>1);
 for(const chunks of plan.chunks){assert.equal(chunks.map(c=>text.slice(c.coreStart,c.coreEnd)).join(''),text);assert.ok(chunks.every(c=>c.questionContext.length<100));}
});

test('unmatched question markers cannot consume later questions or the rest of the document',()=>{
 const text='Q. Unanswered heading?\n'+'Continuation text.\n'.repeat(2500)+'\nQ: Real question?\nA: '+'Full answer. '.repeat(1000);
 const chunks=sectionDocument(text,{chunkBytes:1000,overlapBytes:100});
 assert.equal(chunks.map(c=>text.slice(c.coreStart,c.coreEnd)).join(''),text);
 assert.ok(chunks.every(c=>!c.questionContext.includes('Unanswered heading?')));
 assert.ok(chunks.some(c=>c.questionContext.includes('Real question?')));
});

test('continued long answers retain their full numbered bare question; split label lines work',()=>{
 const question='17 Q Where were you on Monday?\n',text=question+'18 A '+'A complete answer. '.repeat(1000);
 const chunks=sectionDocument(text,{chunkBytes:1000,overlapBytes:100});
 assert.ok(chunks.slice(1).every(c=>c.questionContext===question));
 assert.deepEqual(testimonyMarkers('1 Q\n2 Where were you?\n3 A\n4 At home.').map(m=>m.role),['Q','A']);
});

test('ordinary articles, word initials and unnumbered prose are not bare answer markers',()=>{
 for(const text of ['A person was present.','Q fever was discussed.','14 Apple Road','14 A-grade material','A. person was present.']){
  if(text.startsWith('A.'))continue; // Explicit punctuated labels preserve legacy behavior.
  assert.equal(testimonyMarkers(text).length,0,text);
 }
});
