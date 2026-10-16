import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfReportingRanges} from './pdfReporting.js';
import {parseTestimonySource} from './testimonySource.js';
import {resolveWitnessSource,witnessQuoteMatches} from './sourceEvidence.js';
import {pdfQuoteMap,groundPdfClaim} from './pdfQuoteGrounding.js';
const document=pages=>{let end=0;const map=pages.map((text,i)=>{const start=i?end+2:0;end=start+text.length;return {start,end,pdfPage:i+1,pageLabel:String(i+1),status:'TEXT'};});return {text:pages.join('\n\n'),pages:map};};
const filing='FILED: COUNTY CLERK 01/02/2026 02:30 PM\nINDEX NO. 123/2026\nNYSCEF DOC. NO. 4 RECEIVED NYSCEF: 01/02/2026';
test('repeated filing furniture at page ends does not turn a continued witness answer into court speech',()=>{
 const d=document(['1 CONFIDENTIAL - FICTIONAL WITNESS\n2 EXAMINATION\n3 Q Describe the form.\n4 A I signed the first\n'+filing,'1 CONFIDENTIAL - FICTIONAL WITNESS\n2 form after reading it.\n3 Q Continue?\n4 A That is all.\n'+filing,'1 CONFIDENTIAL - FICTIONAL WITNESS\n2 Q Was it approved?\n3 A Yes.\n4 Q Finished?\n5 A Yes.\n'+filing]);
 assert.equal(pdfReportingRanges(d.text,d.pages).filter(r=>d.text.slice(r.start,r.end).startsWith('FILED:')).length,3);
 const options={pages:d.pages},quote='form after reading it.';assert.equal(witnessQuoteMatches(d.text,quote,options).length,1);
 const binding=resolveWitnessSource(d.text,{original:quote,sourceQuestion:'Describe the form.',sourceAnswer:quote},options);assert.equal(binding.status,'BOUND');
 assert.equal(witnessQuoteMatches(d.text,quote).length,0); // No invented page furniture without a supplied map.
 const whole='I signed the first form after reading it.',map=pdfQuoteMap(d.text,{pages:d.pages});
 const restored=groundPdfClaim({original:whole},d.text,map,{start:0,end:d.text.length,text:d.text});assert.ok(d.text.includes(restored.claim.original));assert.ok(restored.claim.original.includes('FILED:'));assert.equal(resolveWitnessSource(d.text,restored.claim,{...options,map}).status,'BOUND');
});
test('isolated headings and substantive speakers stay boundaries, and witness words remain exact',()=>{
 const d=document(['Q: Did you sign?\nA: I started.\nFILED: A one-off heading','Q: What next?\nMR. LAWYER: I signed the form.','Q: Anything else?\nA: Nothing.']);
 assert.equal(pdfReportingRanges(d.text,d.pages).length,0);assert.equal(witnessQuoteMatches(d.text,'I signed the form.',{pages:d.pages}).length,0);
 assert.equal(resolveWitnessSource(d.text,{original:'Nothing.',sourceQuestion:'An invented question'},{pages:d.pages}).status,'ANCHOR_MISMATCH');
});
test('only literal form objections preserve a pending question; instructions and substantive interruptions clear it',()=>{
 for(const words of ['Objection.','Object to the form.','Objection to form.']){
  const text=`Q: Did you sign on Monday?\nMR. LAWYER: ${words}\nA: Yes.`;const binding=resolveWitnessSource(text,{original:'Yes.',sourceQuestion:'Did you sign on Monday?'});assert.equal(binding.status,'BOUND');assert.ok(parseTestimonySource(text).diagnostics.some(d=>d.code==='PROCEDURAL_OBJECTION'));
 }
 for(const words of ['Objection. Do not answer.','Let me explain what happened.','Yes.']){
  const text=`Q: Did you sign on Monday?\nMR. LAWYER: ${words}\nA: Yes.`;assert.equal(resolveWitnessSource(text,{original:'Yes.',sourceQuestion:'Did you sign on Monday?'}).status,'ANCHOR_MISMATCH');
 }
});
