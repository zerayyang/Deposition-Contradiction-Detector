import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTestimonySource} from '../../server/testimonySource.js';
import {testimonyMarkers} from '../../server/testimonyMarkers.js';
import {witnessQuoteMatches,resolveWitnessSource} from '../../server/sourceEvidence.js';
import {validateClaim} from '../../server/evidenceValidator.js';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
import {validateEventBundle,documentDigest} from '../../server/events/validate.js';

const claim=(original,extra={})=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[],...extra});
const roles={speakerRoles:{'MS. REED':'QUESTIONER','PRESIDENT VALE':'WITNESS','MORGAN CHEN':'WITNESS'}};
const named='Examination record\nMS. REED: Did you sign the form on Monday?\nPRESIDENT VALE: Yes.\nTHE COURT: Take a break.\nMS. REED: Did you read it on Tuesday?\nPRESIDENT VALE: No.';

test('named roles require explicit caller metadata; titles alone never establish witness identity',()=>{
 assert.equal(witnessQuoteMatches(named,'Yes.').length,0);
 const matches=witnessQuoteMatches(named,'Yes.',roles);
 assert.equal(matches.length,1);assert.match(matches[0].question.text,/Monday/);
 assert.equal(matches[0].speaker,'PRESIDENT VALE');assert.equal(matches[0].roleOrigin,'CALLER_METADATA');
 assert.equal(witnessQuoteMatches(named,'Take a break.',roles).length,0);
 assert.equal(witnessQuoteMatches(named,'Did you sign the form on Monday?',roles).length,0);
});
test('every character and literal offset is retained, including Unicode, CRLF and numbered labels',()=>{
 const text='Header 📄\r\n 12 MS. REED: Where?\r\n 13 PRESIDENT VALE: Café.\r\n 14 UNKNOWN PERSON: Elsewhere.';
 const index=parseTestimonySource(text,roles);
 assert.equal(index.turns.map(turn=>text.slice(turn.start,turn.end)).join(''),text);
 assert.equal(index.turns[0].role,'UNATTRIBUTED');
 for(let i=1;i<index.turns.length;i++)assert.equal(index.turns[i].start,index.turns[i-1].end);
 const found=witnessQuoteMatches(text,'Café.',roles)[0];assert.equal(found.index,text.indexOf('Café.'));assert.equal(text.slice(found.index,found.index+5),'Café.');
 assert.ok(index.diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'&&d.speaker==='UNKNOWN PERSON'));
});
test('unknown named speakers cannot be swallowed by a preceding Q/A answer or plain fallback',()=>{
 for(const label of ['ALEX RIVER','Alex River','Alex','PRESIDENT RIVER','MR. RIVER']) {
  const text=`Q: What happened?\nA: I signed it.\n${label}: I burned it.`;
  assert.equal(witnessQuoteMatches(text,'I burned it.').length,0,label);
  assert.equal(witnessQuoteMatches(text,'I signed it.').length,1,label);
  assert.equal(witnessQuoteMatches(`${label}: I burned it.`,'I burned it.').length,0,label);
 }
});
test('caller mappings normalize only label case and whitespace, never infer surnames',()=>{
 const text='Ms. Reed: Where?\nPresident   Vale: At home.\nVALE: At work.';
 assert.equal(witnessQuoteMatches(text,'At home.',roles).length,1);
 assert.equal(witnessQuoteMatches(text,'At work.',roles).length,0);
});
test('ordinary prose, times and URLs do not become speaker turns',()=>{
 for(const text of ['A person was present.','I noted: check this.','At 11:30 I left.','https://example.test','14 Apple Road']) {
  assert.equal(testimonyMarkers(text).length,0,text);
  assert.equal(witnessQuoteMatches(text,text).length,1,text);
 }
});
test('non-witness interruptions never supply a resumed governing question',()=>{
 for(const label of ['THE COURT','MR. ADVOCATE','UNKNOWN PERSON']) {
  const text=`Q: Did you sign on Monday?\n${label}: Wait.\nTHE WITNESS: Yes.`;
  const matches=witnessQuoteMatches(text,'Yes.');assert.equal(matches.length,1);assert.equal(matches[0].question,null);
  assert.deepEqual(matches[0].questions,[]);
  assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Did you sign on Monday?'})).status,'ANCHOR_MISMATCH');
 }
});
test('a fresh question after an interruption restores a literal governing link',()=>{
 const text='Q: First question?\nTHE COURT: Wait.\nQ: Second question?\nA: Yes.';
 assert.equal(witnessQuoteMatches(text,'Yes.')[0].question.text,'Second question?');
 assert.deepEqual(witnessQuoteMatches(text,'Yes.')[0].questions,['Second question?']);
});
test('multiple named witnesses cannot inherit another witness question, but a fresh question is retained',()=>{
 const text='MS. REED: Where on Monday?\nPRESIDENT VALE: At home.\nMORGAN CHEN: At work.\nMS. REED: Where on Tuesday?\nPRESIDENT VALE: At school.';
 assert.equal(witnessQuoteMatches(text,'At work.',roles)[0].question,null);
 assert.equal(witnessQuoteMatches(text,'At school.',roles)[0].question.text,'Where on Tuesday?');
 assert.deepEqual(witnessQuoteMatches(text,'At school.',roles)[0].questions,['Where on Tuesday?']);
});
test('repeated named answers bind only with correct source anchors and keep source label',()=>{
 const text=named+'\nMS. REED: Did you sign on Friday?\nPRESIDENT VALE: Yes.';
 assert.equal(resolveWitnessSource(text,claim('Yes.'),roles).status,'AMBIGUOUS');
 const bound=resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Did you sign on Friday?'}),roles);
 assert.equal(bound.status,'BOUND');assert.equal(bound.selected.speaker,'PRESIDENT VALE');
 assert.equal(bound.selected.start,text.lastIndexOf('Yes.'));
 assert.equal(resolveWitnessSource(text,claim('Yes.',{sourceQuestion:'Invented?'}),roles).status,'ANCHOR_MISMATCH');
});
test('model-provided role claims are ignored, and invalid trusted configurations fail explicitly',()=>{
 const forged=claim('Yes.',{speakerRoles:roles.speakerRoles,speaker:'PRESIDENT VALE',role:'WITNESS'});
 assert.equal(resolveWitnessSource(named,forged).status,'NOT_FOUND');
 for(const speakerRoles of [null,new Map(),[],{'THE COURT':'WITNESS'},{'MR. X':'GUESS'},{'Q':'WITNESS'},{'THE WITNESS':'OTHER'},{'X':'WITNESS',' x ':'OTHER'},{'X:\nA':'WITNESS'}])assert.throws(()=>parseTestimonySource(named,{speakerRoles}),TypeError);
});
test('plain input preserves existing behavior but does not pretend to identify a person',()=>{
 const text='I was at home.';const parsed=parseTestimonySource(text);
 assert.equal(parsed.mode,'PLAIN');assert.equal(parsed.turns[0].speaker,null);assert.equal(parsed.diagnostics[0].code,'UNLABELED_INPUT');
 assert.equal(parseTestimonySource('').turns.length,0);
 assert.throws(()=>parseTestimonySource(null),TypeError);
});
test('named-role source options consistently reach claim validation, binding and deterministic pipeline',()=>{
 const text='MS. REED: Did you sign the lease on Monday?\nPRESIDENT VALE: I signed the lease.';
 const other='Q: Did you sign the lease on Monday?\nA: I did not sign the lease.';
 const a=claim('I signed the lease.',{activityPhrase:'signed the lease'}),b=claim('I did not sign the lease.',{activityPhrase:'did not sign the lease'});
 assert.equal(validateClaim(a,text),false);assert.equal(validateClaim(a,text,roles),true);
 const c={type:'DIRECT',claim1:a,claim2:b};
 assert.equal(assessCandidate(c,text,other).claim1Valid,false);
 const checked=assessCandidate(c,text,other,{claim1:roles});
 assert.equal(checked.claim1Valid,true);assert.equal(checked.sourceBindings.claim1.status,'BOUND');
 const qa='Q: Did you sign the lease on Monday?\nA: I signed the lease.';
 const reference=assessCandidate(c,qa,other);
 for(const field of ['score','status','band','evidenceStrength'])assert.equal(checked[field],reference[field],field);
 assert.equal(assessCandidate({...c,type:'FALSE_POSITIVE',severity:'LOW',reasoning:'Another opinion'},text,other,{claim1:roles}).score,checked.score);
});
function eventBundle(text,qText,aText){
 const source=(id,role,quote)=>({id,role,quote,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length,pageRefs:[]});
 return {schemaVersion:1,documentId:'fictional',documentSha256:documentDigest(text),events:[{id:'e1',kind:'document_signing',summary:'Proposed event, not proven semantics.',assertion:{polarity:'AFFIRMED',sourceIds:['a']},attributes:[],qualifiers:[],relations:[],sources:[source('q','QUESTION',qText),source('a','WITNESS',aText)],reviewRequired:false,unresolvedReasons:[]}],coverage:{status:'COMPLETE',segments:[{start:0,end:text.length,status:'PROCESSED',eventIds:['e1'],reason:null}]}};
}
test('event validator uses the same named-source index and rejects wrong governing questions',()=>{
 const bundle=eventBundle(named,'Did you sign the form on Monday?','Yes.');
 assert.equal(validateEventBundle(bundle,{documentId:'fictional',text:named}).valid,false);
 const checked=validateEventBundle(bundle,{documentId:'fictional',text:named,...roles});
 assert.equal(checked.valid,true,JSON.stringify(checked.errors));assert.ok(checked.sourceDiagnostics.length);
 const copy=structuredClone(bundle),q=copy.events[0].sources[0];q.quote='Did you read it on Tuesday?';q.start=named.indexOf(q.quote);q.end=q.start+q.quote.length;
 assert.ok(validateEventBundle(copy,{documentId:'fictional',text:named,...roles}).errors.some(e=>e.code==='QUESTION_NOT_GOVERNING'));
 assert.equal(validateEventBundle(bundle,{documentId:'fictional',text:named,speakerRoles:{'THE COURT':'WITNESS'}}).errors[0].code,'SOURCE_OPTIONS');
});

test('unanswered questions cannot leak their date into the answered question history',()=>{
 const text='Q: Hypothetically, on Monday?\nQ: What actually happened?\nA: I left.';
 const match=witnessQuoteMatches(text,'I left.')[0];
 assert.equal(match.question.text,'What actually happened?');
 assert.deepEqual(match.questions,['What actually happened?']);
});
test('parsing and validation do not mutate source text, role mappings or event records',()=>{
 const bundle=eventBundle(named,'Did you sign the form on Monday?','Yes.');
 const before=structuredClone(bundle),savedRoles=structuredClone(roles);
 parseTestimonySource(named,roles);validateEventBundle(bundle,{documentId:'fictional',text:named,...roles});
 assert.deepEqual(bundle,before);assert.deepEqual(roles,savedRoles);
});
test('a heading that resembles a speaker label is conservatively unresolved, never guessed as testimony',()=>{
 const text='Notes: Unattributed material.\nQ: What occurred?\nA: I left.';
 assert.equal(witnessQuoteMatches(text,'Unattributed material.').length,0);
 assert.ok(parseTestimonySource(text).diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'));
 assert.equal(witnessQuoteMatches(text,'I left.').length,1);
});

test('a named speaker initial cannot masquerade as a Q/A label',()=>{
 const text='Q: What happened?\nA: I left.\nA. Reed: The lawyer spoke.\nQ. Vale: Another speaker.';
 assert.equal(witnessQuoteMatches(text,'I left.').length,1);
 assert.equal(witnessQuoteMatches(text,'The lawyer spoke.').length,0);
 assert.equal(witnessQuoteMatches(text,'Another speaker.').length,0);
 const options={speakerRoles:{'A. Reed':'OTHER','Q. Vale':'WITNESS'}};
 assert.equal(witnessQuoteMatches(text,'The lawyer spoke.',options).length,0);
 assert.equal(witnessQuoteMatches(text,'Another speaker.',options).length,1);
});
