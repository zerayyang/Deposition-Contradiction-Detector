import {prepareEventWorkflow,executeEventWorkflow} from './workflow.js';
import {reviewableSpeakerLabels} from './sourceRoles.js';
const owner=req=>req.identity?.id??'test-local';
const safeFiles=files=>files?.map(d=>d?Object.fromEntries(['path','name','size','type','extraction','pageMappingStale'].map(k=>[k,d[k]])):null);
export function createEventHandlers({callModel,jobStore=null,codeFingerprint='local-test',maxRequests=12,maxBudgetUsd=25,log=()=>{}}){
 const active=new Map(),settings={codeFingerprint,maxRequests,maxBudgetUsd};
 async function load(req){
  let body=req.body,record=null;
  if(body?.eventJobId){
   if(!jobStore)throw new Error('Server recovery is unavailable; recover the saved case snapshot instead.');
   record=await jobStore.get(body.eventJobId,owner(req));
   if(record.provenance.workflow!=='events-v1'||record.provenance.codeFingerprint!==codeFingerprint)throw new Error('Recovery pipeline or backend version changed. Saved work remains available for review.');
   if(jobStore.isActive(record.id))throw new Error('This event review is already running.');
   if(record.caseId!==body.caseId||record.texts[0]!==body.transcript1||record.texts[1]!==body.transcript2)throw new Error('Recovery does not match the selected case and source texts.');
   const saved=record.result?.analysis?.eventState;
   if(!saved)throw new Error('No event checkpoint is available yet.');
   if(JSON.stringify(saved.speakerRoles)!==JSON.stringify(body.speakerRoles??[{},{}])||saved.sameWitnessConfirmed!==body.sameWitnessConfirmed)throw new Error('Source roles or witness confirmation changed; start a new review explicitly.');
   body={...body,documents:record.documents,eventState:saved};
  }
  return {body,record,prepared:await prepareEventWorkflow(body,settings)};
 }
 return {
  sources(req,res){try{return res.json({documents:[req.body.transcript1,req.body.transcript2].map(text=>{
   if(typeof text!=='string')throw new Error('Supply both source texts.');
   return reviewableSpeakerLabels(text);
  })});}catch(e){return res.status(400).json({error:e.message});}},
  async preview(req,res){try{const {prepared,record}=await load(req);return res.json({...prepared.preview,recoveryEnabled:Boolean(jobStore),eventJobId:record?.id??null,codeFingerprint});}catch(e){return res.status(400).json({error:e.message});}},
  async list(req,res){try{if(!jobStore)return res.json({jobs:[],recoveryEnabled:false});const records=await jobStore.list(owner(req),req.query.caseId);return res.json({recoveryEnabled:true,jobs:records.filter(r=>r.provenance.workflow==='events-v1').map(r=>({id:r.id,caseId:r.caseId,state:r.state,updatedAt:r.updatedAt,backendMatches:r.provenance.codeFingerprint===codeFingerprint}))});}catch{return res.status(500).json({error:'Event recovery could not be listed.'});}},
  async recover(req,res){try{const record=await jobStore.get(req.params.id,owner(req));if(record.provenance.workflow!=='events-v1')throw new Error();return res.json(record);}catch{return res.status(404).json({error:'Event recovery not found.'});}},
  async cancel(req,res){try{const record=await jobStore.get(req.params.id,owner(req));if(record.provenance.workflow!=='events-v1')throw new Error();const running=active.get(record.id);running?.controller.abort();if(running)await running.done;return res.json({state:'cancelled',notice:'In-flight provider work may still be billed.'});}catch{return res.status(404).json({error:'Event recovery not found.'});}},
  async remove(req,res){try{const record=await jobStore.get(req.params.id,owner(req));if(record.provenance.workflow!=='events-v1')throw new Error();await jobStore.remove(record.id,owner(req));return res.json({removed:true});}catch{return res.status(409).json({error:'Event recovery cannot be removed while active or unavailable.'});}},
  async stream(req,res){
   let body,record,prepared;
   try{
    ({body,record,prepared}=await load(req));
    const preview=prepared.preview;
    if(req.body.approvedPlanId!==preview.id||req.body.approvedRequestCount!==preview.requestCount||req.body.approvedMaxUsd!==preview.cost.conservativeBudget)throw new Error('Review and approve this exact phase, request count and budget before starting.');
    if(typeof body.caseId!=='string'||!body.caseId||body.caseId.length>200)throw new Error('Save a case before starting an event review.');
    if(jobStore&&!record)record=await jobStore.create({ownerId:owner(req),caseId:body.caseId,texts:[body.transcript1,body.transcript2],documents:body.documents,originalDocuments:safeFiles(body.originalDocuments),planId:prepared.plan.id,provenance:{workflow:'events-v1',codeFingerprint}});
   }catch(e){return res.status(400).json({error:e.message});}
   const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
   res.status(200).set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders?.();
   let finish;const done=new Promise(resolve=>{finish=resolve;});
   if(record){jobStore.activate(record.id);active.set(record.id,{controller,done});}
   const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(JSON.stringify({event:'heartbeat'})+'\n');},15000);
   try{
    await executeEventWorkflow({prepared,body,signal:controller.signal,callModel:(params,options)=>callModel(params,{...options,auditRunId:record?.id}),onEvent:async event=>{
     if(event.analysis){
      event.analysis.recoveryEnabled=Boolean(record);event.analysis.eventJobId=record?.id??null;
      // Durable checkpoint first; a failed write stops the next paid request.
      if(record)record=await jobStore.checkpoint(record,event,event.event==='result'?event.analysis.status:'running');
     }
     if(!res.destroyed)res.write(JSON.stringify({...event,eventJobId:record?.id??null})+'\n');
    }});
   }catch{log({event:'event_review_interrupted',runId:record?.id??null});if(!res.destroyed)res.write(JSON.stringify({event:'error',error:'Event review interrupted. Saved checkpoints remain; no automatic retries were made.'})+'\n');}
   finally{clearInterval(heartbeat);res.off('close',close);if(record){jobStore.deactivate(record.id);active.delete(record.id);}finish();if(!res.destroyed)res.end();}
  }
 };
}
