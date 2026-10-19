import {checkedSpeakerRoles} from './testimonyMarkers.js';
import {buildPlan,previewPlan,executePlan,digest,outputBudget,userContent} from './documentAnalysis.js';
import {assessCandidate} from './humanConfidencePipeline.js';
import {utf8Bytes} from '../shared/documentLimits.js';
import {runRecheck,estimateRecheckCost} from './consistencyCheck.js';
const identity=req=>req.identity?.id??'test-local';
const remainingPairs=(plan,result)=>plan.pairs.filter(p=>!result?.analysis?.tasks?.some(t=>t.id===p.id&&t.status==='completed'));
export function remainingPreview(plan,result){
 const pairs=remainingPairs(plan,result),output=outputBudget(plan);let estimatedInputTokens=0,inputTokenUpperBudget=0;
 for(const p of pairs){const bytes=utf8Bytes(userContent(plan.chunks[0][p.a],plan.chunks[1][p.b],plan.mode!=='single'));estimatedInputTokens+=Math.ceil(bytes/3);inputTokenUpperBudget+=bytes+8192;}
 // Include the full system prompt reserve from the original per-request budget.
 const reserve=plan.cost.inputTokenUpperBudget-plan.pairs.reduce((n,p)=>n+utf8Bytes(userContent(plan.chunks[0][p.a],plan.chunks[1][p.b],plan.mode!=='single'))+8192,0);
 inputTokenUpperBudget+=Math.ceil(reserve*pairs.length/plan.requestCount);
 estimatedInputTokens+=Math.ceil(reserve*pairs.length/plan.requestCount/3);
 const cost={...plan.cost,estimated:(estimatedInputTokens*plan.model.inputUsdPerMillion+pairs.length*10000*plan.model.outputUsdPerMillion)/1e6,
 conservativeBudget:(inputTokenUpperBudget*plan.model.inputUsdPerMillion+pairs.length*output*plan.model.outputUsdPerMillion)/1e6};
 return {...previewPlan(plan),requestCount:pairs.length,totalRequestCount:plan.requestCount,resuming:true,cost};
}
export function createAnalysisHandlers({instructions,callModel,jobStore=null,codeFingerprint='local-test',runtimeIdentity=null,maxRequests=12,maxBudgetUsd=25,log=()=>{}}) {
 const runningJobs=new Map();
 const provenance=runtimeIdentity??{codeFingerprint,promptSha256:digest(instructions)};
 const prepare=body=>buildPlan([body?.transcript1,body?.transcript2],body?.documents,instructions,{speakerRoles:body?.speakerRoles,sourceRolesReviewed:body?.sourceRolesReviewed,witnessTestimonyConfirmed:body?.witnessTestimonyConfirmed});
 const guard=preview=>{if(preview.requestCount>maxRequests||preview.cost.conservativeBudget>maxBudgetUsd)throw new Error(`Analysis exceeds this server's request or spending allowance (${maxRequests} requests / USD ${maxBudgetUsd}). No paid calls started.`);};
 const load=async req=>{
  if(!jobStore)throw new Error('Recovery storage is unavailable.');
  const record=await jobStore.get(req.body.resumeJobId,identity(req));
  if(jobStore.isActive(record.id))throw new Error('This analysis is still running. Wait or cancel its original connection.');
  if(record.caseId!==req.body.caseId)throw new Error('Recovery belongs to a different case.');
  if(record.provenance.codeFingerprint!==codeFingerprint)throw new Error('The server code changed since this run. Its saved results remain available, but cannot be resumed under different rules.');
  const body={transcript1:record.texts[0],transcript2:record.texts[1],documents:record.documents,speakerRoles:record.provenance.speakerRoles??[{},{}],sourceRolesReviewed:true,witnessTestimonyConfirmed:record.provenance.witnessTestimonyConfirmed},plan=prepare(body);
  if(plan.id!==record.planId)throw new Error('The prompt or plan changed. Export saved results before planning a new analysis.');
  if(req.body.speakerRoles!==undefined){
   if(!Array.isArray(req.body.speakerRoles)||req.body.speakerRoles.length!==2)throw new Error('Supply two reviewed speaker-role maps.');
   const roles=req.body.speakerRoles.map(speakerRoles=>Object.fromEntries(checkedSpeakerRoles({speakerRoles})));
   if(roles.some(r=>Object.keys(r).length)&&req.body.sourceRolesReviewed!==true)throw new Error('Confirm sourceRolesReviewed before using named speaker assignments. No witness role was guessed.');
   const canonical=maps=>JSON.stringify(maps.map(r=>Object.entries(r).sort(([a],[b])=>a.localeCompare(b))));
   if(canonical(roles)!==canonical(plan.speakerRoles))throw new Error('Reviewed source roles changed; do not resume under different witness assignments.');
  }
  if(req.body.transcript1!==undefined&&(req.body.transcript1!==record.texts[0]||req.body.transcript2!==record.texts[1]))throw new Error('Edited inputs cannot resume an older analysis.');
  return {record,plan,body};
 };
 return {
  // Ask-twice check for borderline findings: one extra request, or none if nothing is borderline.
  async recheck(req,res){try{
   const {findings,transcript1,transcript2,estimateOnly}=req.body??{};
   if(!Array.isArray(findings)||findings.length>200||typeof transcript1!=='string'||typeof transcript2!=='string')return res.status(400).json({error:'Send the findings and both transcripts.'});
   const texts=[transcript1,transcript2],estimate=estimateRecheckCost(findings,texts);
   if(estimateOnly||!estimate.pairs)return res.json({findings,checked:0,disagreements:0,estimate});
   if(estimate.upperBound>maxBudgetUsd)return res.status(400).json({error:'Double-check exceeds the spending allowance.'});
   const result=await runRecheck({findings,texts,callModel});
   log({event:'recheck_finished',checked:result.checked,disagreements:result.disagreements});
   return res.json({...result,estimate});
  }catch(err){log({event:'recheck_failed',error:String(err?.message??err).slice(0,200)});return res.status(502).json({error:'Double-check failed; the first results are kept.'});}},
  async preview(req,res){try{const loaded=req.body?.resumeJobId?await load(req):null,plan=loaded?.plan??prepare(req.body),preview=loaded?remainingPreview(plan,loaded.record.result):previewPlan(plan);guard(preview);return res.json({...preview,provenance,...(loaded?{resumeJobId:loaded.record.id}:{})});}catch(e){return res.status(400).json({error:e.message});}},
  async list(req,res){try{if(!jobStore)return res.json({jobs:[],recoveryEnabled:false});const records=await jobStore.list(identity(req),req.query.caseId);return res.json({recoveryEnabled:true,jobs:records.filter(r=>r.provenance.workflow!=='events-v1').map(r=>({id:r.id,caseId:r.caseId,state:r.state,updatedAt:r.updatedAt,completed:r.result?.analysis?.completed??0,planned:r.result?.analysis?.planned??null,canResume:Boolean(r.result)&&r.provenance.codeFingerprint===codeFingerprint&&r.state!=='running'&&r.result?.analysis?.status!=='complete'}))});}catch{return res.status(500).json({error:'Recovery records could not be listed.'});}},
  async recover(req,res){try{const r=await jobStore.get(req.params.id,identity(req));return res.json({id:r.id,caseId:r.caseId,state:r.state,notice:r.notice??null,texts:r.texts,documents:r.documents,originalDocuments:r.originalDocuments,result:r.result,canResume:Boolean(r.result)&&r.provenance.codeFingerprint===codeFingerprint&&r.state!=='running'&&r.result?.analysis?.status!=='complete'});}catch{return res.status(404).json({error:'Recovery record not found or unavailable.'});}},
  async cancel(req,res){try{
   await jobStore.get(req.params.id,identity(req));const running=runningJobs.get(req.params.id);
   if(!running)return res.json({state:'not_running'});
   running.controller.abort();log({event:'analysis_cancel_requested',runId:req.params.id});
   await running.done;return res.json({state:'cancelled',notice:'In-flight provider work may still be billed.'});
  }catch{return res.status(404).json({error:'Analysis not found or unavailable.'});}},
  async remove(req,res){try{await jobStore.remove(req.params.id,identity(req));return res.json({removed:true});}catch{return res.status(409).json({error:'Recovery record could not be removed. Active jobs cannot be deleted.'});}},
  async analyze(req,res){
   let plan;try{plan=prepare(req.body);guard(previewPlan(plan));}catch(e){return res.status(400).json({error:e.message});}
   if(plan.requestCount!==1)return res.status(428).json({error:'This document pair requires a multi-request plan. Preview /api/analysis/plan and explicitly approve it before starting /api/analyze/stream.',plan:previewPlan(plan)});
   const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
   try{const result=await executePlan({plan,texts:[req.body.transcript1,req.body.transcript2],instructions,callModel,provenance,signal:controller.signal});
    // Preserve the established short JSON API's unverified-candidate contract.
    // Strict streamed/PDF findings still require source grounding; rejected raw
    // candidates remain in that analysis audit, never presented as verified.
    if(!plan.manifests.some(Boolean))for(const task of result.analysis.tasks)for(const rejected of task.rejectedFindings??[]){
     const candidate=rejected.candidate;
     if(typeof candidate?.claim1?.original!=='string'||typeof candidate?.claim2?.original!=='string')continue;
     if(req.body.transcript1.includes(candidate.claim1.original)&&req.body.transcript2.includes(candidate.claim2.original))continue;
     const assessed=assessCandidate(candidate,req.body.transcript1,req.body.transcript2,{claim1:{speakerRoles:plan.speakerRoles[0]},claim2:{speakerRoles:plan.speakerRoles[1]}});
     if(assessed.status==='NOT_EVALUABLE'&&assessed.notEvaluableReason==='UNVERIFIED_SOURCE')result.contradictions.push({...assessed,reviewOnly:true,sourceReferences:{claim1:[],claim2:[]},sourceRejection:{pairId:task.id,candidateIndex:rejected.candidateIndex,reason:rejected.reason}});
    }
    if(result.contradictions.length&&result.analysis.status==='failed')result.analysis.status='partial';
    if(result.analysis.status==='failed')return res.status(500).json({error:'Failed to analyze depositions',details:result.analysis.tasks[0]?.error,analysis:result.analysis});return res.json(result);
   }catch(e){if(!res.destroyed)return res.status(500).json({error:'Failed to analyze depositions',details:e.message});}finally{res.off('close',close);}
  },
  async stream(req,res){
   let plan,record,body=req.body;
   try{
    if(req.body?.resumeJobId){const loaded=await load(req);({plan,record,body}=loaded);}else plan=prepare(body);
    const preview=record?remainingPreview(plan,record.result):previewPlan(plan);guard(preview);
    if(body.approvedPlanId!==plan.id&&req.body.approvedPlanId!==plan.id)return res.status(409).json({error:'The analysis plan changed or was not approved. Preview and approve the current request count and cost first.'});
    if(!preview.requestCount)return res.status(409).json({error:'All comparisons are already complete. Recover the saved results instead of paying again.'});
    if(jobStore&&!record){if(typeof req.body.caseId!=='string'||!req.body.caseId||req.body.caseId.length>200)throw new Error('Save a case before starting recoverable analysis.');
     record=await jobStore.create({ownerId:identity(req),caseId:req.body.caseId,texts:[body.transcript1,body.transcript2],documents:body.documents,originalDocuments:req.body.originalDocuments?.map(d=>d?Object.fromEntries(['path','name','size','type','extraction','pageMappingStale'].map(k=>[k,d[k]])):null),planId:plan.id,provenance:{model:plan.model.id,promptSha256:digest(instructions),codeFingerprint,speakerRoles:plan.speakerRoles,witnessTestimonyConfirmed:plan.witnessTestimonyConfirmed}});}
   }catch(e){return res.status(400).json({error:e.message});}
   const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
   res.status(200).set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders?.();
   let finished;const done=new Promise(resolve=>{finished=resolve;});
   const started=performance.now();if(record){jobStore.activate(record.id);runningJobs.set(record.id,{controller,done});}
   const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(JSON.stringify({event:'heartbeat'})+'\n');},15000);
   const originalResult=record?.result;
   try{
    await executePlan({plan,provenance,resume:originalResult,texts:[body.transcript1,body.transcript2],instructions,callModel:(params,options)=>callModel(params,{...options,auditRunId:record?.id}),signal:controller.signal,onEvent:async event=>{
     if(event.analysis)event.analysis={...event.analysis,recoveryEnabled:Boolean(record)};
     if(event.analysis&&record)event.analysis={...event.analysis,jobId:record.id,recoveryEnabled:true,provenance:{...event.analysis.provenance,codeFingerprint}};
     // The server saves before sending a checkpoint or beginning the next paid call.
     if(record&&['checkpoint','result'].includes(event.event))record=await jobStore.checkpoint(record,event,event.event==='result'?event.analysis.status:'running');
     if(record&&event.event==='progress')record=await jobStore.checkpoint(record,{topicsReviewed:record.result?.topicsReviewed??[],contradictions:record.result?.contradictions??[],analysis:event.analysis},'running');
     if(!res.destroyed)res.write(JSON.stringify({...event,...(record?{jobId:record.id}:{})})+'\n');
     if(['checkpoint','result'].includes(event.event))log({event:'analysis_checkpoint',runId:record?.id??null,status:event.analysis.status,completed:event.analysis.completed,failed:event.analysis.failed,partial:event.analysis.partial,durationMs:Math.round(performance.now()-started)});
    }});
   }catch{log({event:'analysis_interrupted',runId:record?.id??null,category:'CHECKPOINT_OR_PROCESSING_FAILURE'});if(!res.destroyed)res.write(JSON.stringify({event:'error',error:'Analysis interrupted. Recover the last saved checkpoint; no automatic retries were made.',status:'failed'})+'\n');}
   finally{clearInterval(heartbeat);res.off('close',close);if(record){jobStore.deactivate(record.id);runningJobs.delete(record.id);}finished();if(!res.destroyed)res.end();}
  }
 };
}
