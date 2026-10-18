import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionConfidence,EVIDENCE,COMPATIBLE_CAP} from '../../server/scoring/decisionConfidence.js';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';

// Fictional findings. Evidence comes from the checked decision; commitment from the owner's word lists.
const finding=(over={})=>({type:'DIRECT',decision:{conflictForm:'AFFIRM_VS_DENY'},claim1:{original:'I signed the form.'},claim2:{original:'I did not sign the form.'},...over});
test('clash form sets evidence; firm wording scores higher than hedged wording',()=>{
 const firm=decisionConfidence(finding()),hedged=decisionConfidence(finding({claim1:{original:'I think I signed the form.'}}));
 assert.equal(firm.evidence,EVIDENCE.AFFIRM_VS_DENY);assert.equal(firm.score,Math.round(100*0.95*(0.5+0.5*0.8)));
 assert.ok(hedged.score<firm.score);
 assert.ok(decisionConfidence(finding({type:'INFERENTIAL',decision:{conflictForm:'REQUIRES_INFERENCE'}})).score<firm.score);
});
test('code-checked values, missing facts and compatible pairs follow fixed rules',()=>{
 assert.equal(decisionConfidence(finding({valueCheck:{kind:'time',exact:true,overlap:false}})).evidence,1);
 const noted=decisionConfidence(finding({reviewNote:'Which form is meant.'}));assert.ok(noted.evidence<EVIDENCE.AFFIRM_VS_DENY);
 const ok=decisionConfidence(finding({type:'FALSE_POSITIVE',decision:{conflictForm:'NONE'}}));assert.equal(ok.status,'COMPATIBLE');assert.ok(ok.score<=COMPATIBLE_CAP);
 assert.equal(decisionConfidence({type:'DIRECT'}),null,'no decision, no preview score');
});
test('the decision-based score is displayed by default; CONFIDENCE_SOURCE=rules restores the rule engine',()=>{
 const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
 const a='I signed the form.',b='I did not sign the form.';
 const decision={sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',value1:'',value2:'',missingFact:''};
 const r=assessCandidate({type:'DIRECT',decision,reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign?\nA: ${a}`,`Q: Did you sign?\nA: ${b}`);
 assert.ok(r.decisionScore&&r.decisionScore.score>0);
 assert.equal(r.humanConfidence,r.decisionScore.score);assert.equal(r.scoreSource,'decision');
 const before=process.env.CONFIDENCE_SOURCE;process.env.CONFIDENCE_SOURCE='rules';
 try{const rules=assessCandidate({type:'DIRECT',decision,reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign?\nA: ${a}`,`Q: Did you sign?\nA: ${b}`);assert.notEqual(rules.scoreSource,'decision');}
 finally{if(before===undefined)delete process.env.CONFIDENCE_SOURCE;else process.env.CONFIDENCE_SOURCE=before;}
});
test('a decision-based score clears the not-evaluable review flag',()=>{
 const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
 const a='Yes, we met.',b='We never met.';
 const decision={sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',value1:'',value2:'',missingFact:''};
 const r=assessCandidate({type:'DIRECT',decision,reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you meet?\nA: ${a}`,`Q: Did you meet?\nA: ${b}`);
 assert.equal(r.status,'CONFLICT_SUPPORTED');assert.equal(r.flag,'NONE');
});
test('the displayed evidence and commitment are the ones the score was computed from',()=>{
 const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
 const a='I think we met.',b='We never met.';
 const decision={sameSubject:'YES',sameCircumstances:'SAME',circumstancesQuote:'',canBothBeTrue:'NO',reconciliation:'NONE',reconciliationQuote:'',conflictForm:'AFFIRM_VS_DENY',value1:'',value2:'',missingFact:''};
 const r=assessCandidate({type:'DIRECT',decision,reasoning:'Fictional.',claim1:claim(a),claim2:claim(b)},`Q: Did you meet?\nA: ${a}`,`Q: Did you meet?\nA: ${b}`);
 assert.equal(r.evidenceStrength,EVIDENCE.AFFIRM_VS_DENY);assert.equal(r.commitment.pair,r.decisionScore.commitment);
 assert.ok(r.commitment.claim1<r.commitment.claim2,'hedged claim keeps its own lower commitment');
 assert.equal(r.humanConfidence,Math.round(100*r.evidenceStrength*(0.5+0.5*r.commitment.pair)));
});
