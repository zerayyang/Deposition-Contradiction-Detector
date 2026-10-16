import {remainingPreview} from './analysisHandlers.js';
import {createMeasuredModel} from './runtimeControls.js';
import {buildPlan,previewPlan,executePlan,digest,MODEL,directRequest} from './documentAnalysis.js';
import {prepareEventWorkflow,executeEventWorkflow} from './events/workflow.js';
import {utf8Bytes} from '../shared/documentLimits.js';
const cents=n=>Math.ceil(n*1e6)/1e6;
const sourceBody=body=>Object.fromEntries(['transcript1','transcript2','documents','originalDocuments','caseId','workflow','phase','speakerRoles','sourceRolesReviewed','sameWitnessConfirmed','useApprovedMemory','eventState'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
export function requestUpperCost(params){return cents(((utf8Bytes(JSON.stringify(params))+8192)*MODEL.inputUsdPerMillion+params.max_tokens*MODEL.outputUsdPerMillion)/1e6);}
function observedCost(message,reserved){const u=message?.usage;if(!Number.isSafeInteger(u?.input_tokens)||!Number.isSafeInteger(u?.output_tokens)||u.input_tokens<0||u.output_tokens<0||u.cache_read_input_tokens||u.cache_creation_input_tokens)return reserved;return Math.max(0,(u.input_tokens*MODEL.inputUsdPerMillion+u.output_tokens*MODEL.outputUsdPerMillion)/1e6);}
export function createCloudAnalysis({instructions,callModel,storeForRequest,codeFingerprint,maxRequests=512,maxBudgetUsd=25,readApprovedMemory=null,stepTimeoutMs=240000,legacyPlanOptions={}}){
 async function prepare(req,body){
  if(body.workflow!=='events-v1'){const plan=buildPlan([body.transcript1,body.transcript2],body.documents,instructions,{...legacyPlanOptions,speakerRoles:body.speakerRoles,sourceRolesReviewed:body.sourceRolesReviewed});return {plan,preview:previewPlan(plan)};}
  let approvedMemory=null,checkMemory=null;
  if(body.phase==='compare'&&body.useApprovedMemory){if(!readApprovedMemory)throw new Error('Approved memory unavailable.');approvedMemory=await readApprovedMemory(req,body);checkMemory=async()=>{const next=await readApprovedMemory(req,body);if(next.snapshotSha256!==approvedMemory.snapshotSha256)throw new Error('Approved memory changed; review a fresh plan.');};}
  const event=await prepareEventWorkflow(body,{codeFingerprint,maxRequests,maxBudgetUsd:Infinity,approvedMemory,checkMemory});return {event,plan:event.plan,preview:event.preview};
 }
 async function load(req,{allowStale=false,caseId=req.params?.caseId,jobId=req.params?.jobId}={}){
  const store=storeForRequest(req);await store.authorize(caseId);
  const meta=await store.get(caseId,jobId,'manifest');if(!meta)throw new Error('Saved hosted job not found.');
  if(!Number.isFinite(meta.maxUsd)||meta.maxUsd<=0||meta.maxUsd>maxBudgetUsd)throw new Error('Invalid saved spending allowance.');
  if(meta.codeFingerprint!==codeFingerprint&&!allowStale)throw new Error('The backend changed. Saved progress remains available; start a newly approved plan before further paid work.');
  let latest=null,sequence=0,spent=0;
  if(store.latest)({latest,sequence,spent}=await store.latest(caseId,jobId));
  else while(sequence<=maxRequests){const result=await store.get(caseId,jobId,`s${sequence}-result`);if(!result)break;latest=result.result;spent+=result.costUsd;sequence++;}
  const claimed=await store.get(caseId,jobId,`s${sequence}-claim`),cancelled=await store.get(caseId,jobId,'cancelled');
  return {caseId,jobId,store,meta,latest,sequence,spent,claimed,cancelled,stale:meta.codeFingerprint!==codeFingerprint};
 }
 const decorate=(result,j)=>({...result,analysis:{...result.analysis,cloudJobId:j.jobId,cloudCaseId:j.caseId,execution:'durable-steps',recoveryEnabled:true,cloudSpentUsd:j.spent,cloudBudgetUsd:j.meta.maxUsd}});
 function final(result){if(!result)return false;return ['complete','awaiting_comparison','cancelled'].includes(result.analysis.status)||result.analysis.tasks?.some(t=>['failed','partial','cancelled'].includes(t.status));}
 function reply(j){const result=j.latest?decorate(j.latest,j):null;return {jobId:j.jobId,caseId:j.caseId,spentUsd:j.spent,maxUsd:j.meta.maxUsd,result,done:Boolean(j.cancelled)||final(result),waiting:Boolean(j.claimed),notice:j.claimed?'A request was started but has no durable result yet. It may still be billed. No automatic retry is allowed.':null};}
 const error=(res,e)=>res.status(400).json({error:e.message});
 return {
  async preview(req,res){try{let body=sourceBody(req.body);let resumed=null;if(req.body.cloudJobId){resumed=await load(req,{caseId:body.caseId,jobId:req.body.cloudJobId});if(resumed.claimed)throw new Error('A prior step is still claimed; check saved progress without retrying paid work.');if(resumed.cancelled||final(resumed.latest))throw new Error('This saved job has ended. Inspect its retained results before starting a new review.');if(body.transcript1!==resumed.meta.body.transcript1||body.transcript2!==resumed.meta.body.transcript2)throw new Error('Source text changed; do not resume a different document.');body={...resumed.meta.body,...(resumed.latest?.analysis.eventState?{eventState:resumed.latest.analysis.eventState}:{})};}const prepared=await prepare(req,body);if(resumed&&!prepared.event)prepared.preview=remainingPreview(prepared.plan,resumed.latest);
   const params=prepared.event?prepared.plan.tasks.filter(t=>t.mode!=='LOCAL_NON_WITNESS'&&!prepared.event.cache.has(digest(JSON.stringify(t.input)))).map(t=>({model:MODEL.id,max_tokens:prepared.plan.outputTokens,system:prepared.plan.system,output_config:{format:prepared.plan.outputFormat,effort:prepared.plan.effort??'medium'},messages:[{role:'user',content:JSON.stringify(t.input)}]}))
    :prepared.plan.pairs.filter(t=>!resumed?.latest?.analysis?.tasks?.some(old=>old.id===t.id&&old.status==='completed')).map(t=>directRequest(prepared.plan,prepared.plan.chunks[0][t.a],prepared.plan.chunks[1][t.b],instructions));
   prepared.preview.cost={...prepared.preview.cost,conservativeBudget:cents(params.reduce((n,p)=>n+requestUpperCost(p),0))};
   if(prepared.preview.requestCount>maxRequests)throw new Error('Plan exceeds hosted request allowance. No paid calls started.');return res.json({...prepared.preview,approvedBudgetUsd:Math.min(prepared.preview.cost.conservativeBudget,maxBudgetUsd),serverBudgetLimitUsd:maxBudgetUsd,...(resumed?{approvedBudgetUsd:Math.max(0,resumed.meta.maxUsd-resumed.spent),budgetFixed:true}:{}),execution:'durable-steps',recoveryEnabled:true,codeFingerprint,provenance:{codeFingerprint,promptSha256:digest(instructions),model:MODEL.id},notice:'One model request per hosted step; private checkpoints survive browser closure. Work pauses between steps when the tab closes. No automatic retries. Cost approval still applies.'});}catch(e){return error(res,e);}},
  async start(req,res){try{
   const {caseId,jobId}=req.params,store=storeForRequest(req);await store.authorize(caseId);
   const body=sourceBody(req.body);if(body.caseId!==caseId)throw new Error('Case identifier mismatch.');
   const prepared=await prepare(req,body),preview=prepared.preview;
   if(req.body.approvedPlanId!==preview.id||req.body.approvedRequestCount!==preview.requestCount)throw new Error('Review and approve the current hosted plan before starting.');
   const maxUsd=req.body.approvedMaxUsd;if(!Number.isFinite(maxUsd)||maxUsd<=0||maxUsd>maxBudgetUsd||preview.requestCount>maxRequests)throw new Error('Invalid hosted spending/request allowance.');
   if(maxUsd<preview.cost.conservativeBudget&&req.body.allowPartialBudget!==true)throw new Error('The approved budget does not cover this full phase. No paid work started.');
   const meta={body,planId:preview.id,codeFingerprint,maxUsd,createdAt:new Date().toISOString(),sourceHash:digest(JSON.stringify(body))};
   if(!await store.put(caseId,jobId,'manifest',meta)){const old=await store.get(caseId,jobId,'manifest');if(old?.sourceHash!==meta.sourceHash||old?.maxUsd!==maxUsd||old.codeFingerprint!==codeFingerprint)throw new Error('Job identity already belongs to a different approval.');}
   return res.json({jobId,caseId,execution:'durable-steps',recoveryEnabled:true});
  }catch(e){return error(res,e);}},
  async status(req,res){try{return res.json(reply(await load(req,{allowStale:true})));}catch(e){return error(res,e);}},
  async cancel(req,res){try{const j=await load(req,{allowStale:true});await j.store.put(j.caseId,j.jobId,'cancelled',{at:new Date().toISOString()});return res.json({cancelled:true,notice:'Already-started work may still be billed. Saved results remain available.'});}catch(e){return error(res,e);}},
  async step(req,res){let j;try{
   j=await load(req);if(j.cancelled||final(j.latest))return res.json(reply(j));if(j.claimed)return res.status(409).json({...reply(j),error:'A step is already claimed. Do not retry it; inspect saved progress.'});
   const body={...j.meta.body};if(j.latest?.analysis.eventState)body.eventState=j.latest.analysis.eventState;
   const prepared=await prepare(req,body);
   const claim={at:new Date().toISOString(),codeFingerprint};
   if(!await j.store.put(j.caseId,j.jobId,`s${j.sequence}-claim`,claim))return res.status(409).json({error:'This step was already started. No duplicate call was made.'});
   const timeout=AbortSignal.timeout(stepTimeoutMs),controller=new AbortController();
   const signal=AbortSignal.any([timeout,controller.signal]);let paid=0,costUsd=0,stopped=false;const measured=createMeasuredModel(callModel,{timeoutMs:stepTimeoutMs});
   const timer=setInterval(async()=>{if(stopped)return;try{if(await j.store.get(j.caseId,j.jobId,'cancelled'))controller.abort();}catch{controller.abort();}},5000);timer.unref?.();
   let result;
   try{
    const invoke=async(params,options)=>{
     if(paid)throw new Error('Only one new model request is permitted per hosted step.');
     signal.throwIfAborted();const reserved=requestUpperCost(params);if(j.spent+reserved>j.meta.maxUsd)throw new Error('The remaining approved budget cannot cover this request. No new paid call started.');
     if(!await j.store.put(j.caseId,j.jobId,`s${j.sequence}-reserve`,{reservedUsd:reserved,requestHash:digest(JSON.stringify(params))}))throw new Error('Paid reservation already exists; no duplicate call allowed.');
     paid++;costUsd=reserved;
     const message=await measured(params,{...options,signal,maxRetries:0});costUsd=observedCost(message,reserved);return message;
    };
    if(prepared.event)result=await executeEventWorkflow({prepared:prepared.event,body,callModel:invoke,signal,maxNewRequests:1});
    else result=await executePlan({plan:prepared.plan,texts:[body.transcript1,body.transcript2],instructions,callModel:invoke,signal,resume:j.latest,maxNewRequests:1,provenance:{codeFingerprint}});
   }finally{stopped=true;clearInterval(timer);}
   if(!await j.store.put(j.caseId,j.jobId,`s${j.sequence}-result`,{result,costUsd,totalSpentUsd:j.spent+costUsd,paidRequests:paid,savedAt:new Date().toISOString()}))throw new Error('A checkpoint already exists; inspect saved progress.');
   j.latest=result;j.spent+=costUsd;j.claimed=null;return res.json(reply(j));
  }catch(e){return error(res,e);}}
 };
}
