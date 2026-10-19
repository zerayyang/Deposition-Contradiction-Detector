import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeStore} from './practiceStore.js';

test('practice decisions follow the real review rules and save nothing anywhere',async()=>{
 const s=createPracticeStore();
 await assert.rejects(()=>s.review({decision:'APPROVE',rationale:'   ',sourceChecked:true,expectedDecisionId:null}),/nonblank explanation/);
 await assert.rejects(()=>s.review({decision:'APPROVE',rationale:'Checked both answers carefully.',sourceChecked:false,expectedDecisionId:null}),/source review/);
 const first=await s.review({decision:'APPROVE',rationale:'Checked both answers carefully.',sourceChecked:true,expectedDecisionId:null});
 assert.equal((await s.reviewState()).decision.decision,'APPROVE');
 await assert.rejects(()=>s.review({decision:'REJECT',rationale:'Changed my mind about this.',sourceChecked:false,expectedDecisionId:first}),/Revoke/);
 await assert.rejects(()=>s.releaseMemory({enabled:true,lesson:'Different evenings are not a contradiction.',searchTerms:['evening'],notEvaluationMaterial:false}),/private case details/);
 await s.releaseMemory({enabled:true,lesson:'Different evenings are not a contradiction.',searchTerms:['evening'],notEvaluationMaterial:true});
 assert.equal((await s.reviewState()).release.enabled,true);
 await s.review({decision:'REVOKE',rationale:'Withdrawing the practice approval.',sourceChecked:false,expectedDecisionId:first});
 assert.equal((await s.reviewState()).example,null);
});
