import test from 'node:test';
import assert from 'node:assert/strict';
import {runVerifier} from './verify.mjs';
// Independent protocol fixture; no author imports, private bundle reads or app calls.
test('Level 2 provenance never enters detector request; no finding stays a failure',async()=>{
 const row={id:'l2-protocol-only',transcript1_text:'Synthetic testimony A.',transcript2_text:'Synthetic testimony B.',expected_type:'FALSE_POSITIVE',expected_evidence:'NOT_EVALUABLE',expected_score_band:null,tricky_feature:'Protocol only',rationale:'Temporary request-isolation fixture.',status:'approved',source_refs:{level:2,bundle_id:'private-not-opened',proposal_sha256:'a'.repeat(64)},human_review:{explicit_human_review:true}};
 let calls=0;
 const result=await runVerifier({rows:[row],runs:1,invariants:{pass:true},fetchImpl:async(url,options)=>{
  calls++;assert.deepEqual(JSON.parse(options.body),{transcript1:row.transcript1_text,transcript2:row.transcript2_text});
  assert.ok(!options.body.includes('source_refs'));assert.ok(!options.body.includes('private-not-opened'));
  return {ok:true,status:200,text:async()=>JSON.stringify({topicsReviewed:[],contradictions:[]})};
 }});
 assert.equal(calls,1);assert.equal(result.pass,false);assert.equal(result.cases[0].runs[0].candidates.length,0);
 assert.equal(row.status,'approved');
});
