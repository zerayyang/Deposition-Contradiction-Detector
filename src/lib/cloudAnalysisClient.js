import {readApiJson} from './apiResponse.js';
const base=(caseId,jobId)=>'/api/cloud/'+encodeURIComponent(caseId)+'/'+encodeURIComponent(jobId);
export async function runCloudAnalysis(body,plan,{signal,onEvent=()=>{},fetchImpl=fetch,newId=()=>crypto.randomUUID(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const jobId=body.cloudJobId??newId(),path=base(body.caseId,jobId);
 const request=async(suffix,options={})=>readApiJson(await fetchImpl(path+suffix,{...options,signal,headers:{'Content-Type':'application/json',...options.headers}}),'Hosted progress could not be read. Saved work remains available.');
 const cancel=()=>{void fetchImpl(path+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});};
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  signal?.throwIfAborted();
  if(!body.cloudJobId&&new TextEncoder().encode(JSON.stringify(body)).length>4*1024*1024)throw new Error('This hosted request exceeds 4 MiB. No text was shortened and no paid call started.');
  if(!body.cloudJobId){await request('/start',{method:'POST',body:JSON.stringify({...body,approvedPlanId:plan.id,approvedRequestCount:plan.requestCount,approvedMaxUsd:plan.approvedBudgetUsd??plan.cost.conservativeBudget,allowPartialBudget:plan.approvedBudgetUsd!==undefined&&plan.approvedBudgetUsd<plan.cost.conservativeBudget})});}
  await onEvent({event:'start',jobId,cloudJobId:jobId,plan});
  // A zero-work checkpoint lets the saved case retain the job ID before any
  // provider request. A lost browser cannot erase already saved server results.
  let state=await request('');
  const initial=state.result??{topicsReviewed:[],contradictions:[],analysis:{status:'running',planned:plan.requestCount,completed:0,failed:0,partial:0,attempted:0,tasks:[],cloudJobId:jobId,cloudCaseId:body.caseId,execution:'durable-steps',recoveryEnabled:true}};
  await onEvent({event:'checkpoint',...initial});
  for(let n=0;n<1024;n++){
   signal?.throwIfAborted();
   if(state.waiting)throw new Error('A hosted request has no saved final result yet. Keep its job ID and check saved progress; do not pay for an automatic retry.');
   if(state.done){const result=state.result??initial;await onEvent({event:'result',...result});return result;}
   await onEvent({event:'progress',attempted:(state.result?.analysis?.attempted??0)+1,completed:state.result?.analysis?.completed??0,total:plan.requestCount,analysis:state.result?.analysis});
   state=await request('/step',{method:'POST',body:'{}'});
   if(state.result)await onEvent({event:'checkpoint',...state.result});
   // Yield between short invocations. Polls and recovery never call the model.
   if(!state.done)await sleep(250);
  }
  throw new Error('Hosted step allowance reached. Saved progress is retained.');
 }finally{signal?.removeEventListener('abort',cancel);}
}
export async function readCloudProgress(caseId,jobId,fetchImpl=fetch){return readApiJson(await fetchImpl(base(caseId,jobId)),'Saved hosted progress unavailable.');}

export function resumableCloudJobId(analysis){
 if(analysis?.comparisonFinished===true)return null;
 if(!analysis?.cloudJobId||['complete','failed','cancelled'].includes(analysis.status)||analysis.tasks?.some(t=>['failed','partial','cancelled'].includes(t.status)))return null;
 return analysis.cloudJobId;
}
