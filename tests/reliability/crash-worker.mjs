// Child process with mocked model calls only. Never starts a server.
import {createJobStore} from '../../server/jobStore.js';
import {buildPlan,executePlan} from '../../server/documentAnalysis.js';
const texts=['Q: What happened Monday?\nA: I signed the lease.\nQ: What next?\nA: I went home.','Q: What happened Monday?\nA: I did not sign the lease.\nQ: What next?\nA: I stayed.'];
const plan=buildPlan(texts,[],'rules',{singleRequestBytes:1,chunkBytes:75,overlapBytes:0}),store=createJobStore(process.argv[2]);
let record=await store.create({ownerId:'crash-test',caseId:'fictional',texts,documents:[],planId:plan.id,provenance:{codeFingerprint:'test'}});store.activate(record.id);let calls=0;
await executePlan({plan,texts,instructions:'rules',callModel:async()=>{calls++;if(calls>1)return new Promise(()=>{});return {stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:'{"topicsReviewed":[],"contradictions":[]}'}]};},onEvent:async event=>{if(event.event==='checkpoint'){record=await store.checkpoint(record,event);process.send({id:record.id,completed:event.analysis.completed,total:plan.requestCount});await new Promise(()=>{setInterval(()=>{},1000);});}}});
