import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEventWorkflow} from '../../server/events/workflow.js';
import {buildEventExtractionPlan} from '../../server/events/extract.js';

// Fictional transcript with named speakers. Saved cases store role maps as JSONB, which
// reorders keys; the same roles in another order must not look like different settings.
const t1='MR. ROE: Where were you?\nMS. DOE: At home.\nMS. LEE: Objection.\nMR. ROE: All evening?\nMS. DOE: Yes.';
const t2='MR. ROE: Where were you?\nMS. DOE: I went out at 7.\nMS. LEE: Objection.';
const rolesA={'MR. ROE':'QUESTIONER','MS. LEE':'OTHER','MS. DOE':'WITNESS'};
const rolesB={'MS. DOE':'WITNESS','MS. LEE':'OTHER','MR. ROE':'QUESTIONER'};
const body=roles=>({workflow:'events-v1',phase:'extract',caseId:'fictional',sameWitnessConfirmed:true,transcript1:t1,transcript2:t2,speakerRoles:[roles,roles],witnessTestimonyConfirmed:[false,false]});

test('the reading plan is the same whatever order the speaker roles are listed in',async()=>{
  const a=await prepareEventWorkflow(body(rolesA)),b=await prepareEventWorkflow(body(rolesB));
  assert.equal(a.plan.id,b.plan.id);
});

test('a reading saved under an older role order is still recognised',async()=>{
  const legacy=buildEventExtractionPlan([t1,t2].map((text,i)=>({documentId:`transcript-${i+1}`,text,speakerRoles:rolesB,witnessTestimonyConfirmed:false})),{maxRequests:12});
  const canonical=(await prepareEventWorkflow(body(rolesA))).plan.id;
  assert.notEqual(legacy.id,canonical,'fixture really uses a different key order');
  const compare={...body(rolesA),phase:'compare',eventState:{extraction:{planId:legacy.id,status:'COMPLETE',tasks:[],documents:[]}}};
  await assert.rejects(prepareEventWorkflow(compare),error=>{assert.doesNotMatch(error.message,/different sources, roles or instructions/);return true;});
});

test('genuinely different roles are still refused',async()=>{
  const other=buildEventExtractionPlan([t1,t2].map((text,i)=>({documentId:`transcript-${i+1}`,text,speakerRoles:{...rolesA,'MS. LEE':'QUESTIONER'},witnessTestimonyConfirmed:false})),{maxRequests:12});
  const compare={...body(rolesA),phase:'compare',eventState:{extraction:{planId:other.id,status:'COMPLETE',tasks:[],documents:[]}}};
  await assert.rejects(prepareEventWorkflow(compare),/different sources, roles or instructions/);
});
