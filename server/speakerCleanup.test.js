import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTestimonySource} from './testimonySource.js';
import {witnessQuoteMatches} from './sourceEvidence.js';
import {reviewableSpeakerLabels,requireSpeakerReview} from './sourceRoles.js';
import {checkedSpeakerRoles} from './testimonyMarkers.js';
test('document captions and court staff stay source boundaries without manual role assignments',()=>{
 const headings=['In The Matter Of','COUNTY OF SAMPLE','B E F O R E','By','FILED','P E O P L E O F T H E S T A T E O F','V I D E O T A P E D D E P O S I T I O N O F','V I D E O T A P E D E P O S I T I O N O F','RE','Dated','CASE NAME','DATE OF DEPOSITION','WITNESSES’ NAME','DISCLAIMER','COURT OFFICER','THE COURT OFFICER','THE VIDEOGRAPHER','THE STENOGRAPHER','BY MR. REED','EXAMINATION BY MR. REED'];
 for(const label of headings){const text=`Q: Did you sign?\nA: Yes.\n${label}: Staff or document material.\nQ: Did you leave?\nA: No.`;
  assert.equal(reviewableSpeakerLabels(text).labels.length,0,label);assert.equal(witnessQuoteMatches(text,'Staff or document material.').length,0,label);assert.equal(parseTestimonySource(text).turns.map(t=>text.slice(t.start,t.end)).join(''),text);
  assert.throws(()=>checkedSpeakerRoles({speakerRoles:{[label]:'WITNESS'}}));
 }
});
test('addressed people and PDF timestamps in testimony are not speaker names',()=>{
 for(const line of ['Mr. Reed, it says: this was signed.','Mr. Reed was the director? 11:32:01','Ms. Vale writes, "Speak now." 12:32:00','Mr. River to make that claim 12:45:00']){
  const text='Q: What did the letter say?\nA: It read as follows.\n'+line;
  assert.equal(reviewableSpeakerLabels(text).labels.length,0,line);assert.equal(witnessQuoteMatches(text,line).length,1,line);
 }
});
test('actual unreviewed names remain bounded and require review; Q/A is already recognized',()=>{
 const text='Q: What happened?\nA: I left.\nMR. REED: Wait.\nPRESIDENT VALE: I signed.';
 const found=reviewableSpeakerLabels(text);assert.ok(found.labels.includes('MR. REED'));assert.ok(found.labels.includes('PRESIDENT VALE'));assert.equal(found.hasAnswers,true);assert.equal(found.hasQuestions,true);
 assert.throws(()=>requireSpeakerReview(text,{}),/Review/);assert.equal(witnessQuoteMatches(text,'I signed.').length,0);
 for(const label of ['Mr. Reed','Ms. Vale','Dr. Lane'])assert.equal(witnessQuoteMatches('Q: Did you sign?\nA: Yes.\n'+label+': I did not sign.','I did not sign.').length,0);
});
