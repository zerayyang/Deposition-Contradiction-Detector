import {HYBRID_VERSION} from '../../shared/hybridConfidence.js';

// Keep two findings busy without waiting for a paired batch. Free plans reserve
// shared funds before paid steps; each finding keeps seven strictly ordered steps.
export async function runConcurrentConfidence({findings,texts,caseId,allowance,fetchImpl,signal,onCheckpoint,onProgress,post}) {
  let results=findings.map(f=>({...f,hybridConfidence:{version:HYBRID_VERSION,originalType:f.type,status:'PENDING',score:null}}));
  let cursor=0,allocation=0,halt=null,saveQueue=Promise.resolve(),saveFailure=null;
  const save=()=>{
    const snapshot=structuredClone(results);
    saveQueue=saveQueue.then(()=>onCheckpoint(snapshot)).catch(error=>{saveFailure=error;halt='INCOMPLETE';throw error;});
    return saveQueue;
  };
  const failureStatus=error=>signal?.aborted?'CANCELLED':['ALLOWANCE_USED','BUDGET_LIMIT'].includes(error.code)?'BUDGET_LIMIT':error.code==='SOURCE_REVIEW_REQUIRED'?'SOURCE_REVIEW_REQUIRED':'INCOMPLETE';
  const review=async({index,plan})=>{
    const finding=results[index];
    try {
      for(let step=0;step<7;step++) {
        if(signal?.aborted){halt='CANCELLED';break;}
        if(halt)break;
        const checks=results.reduce((sum,f)=>sum+(f.hybridConfidence.completedSteps??0),0);
        onProgress(`Checking confidence · up to 2 findings at once · ${checks} checks finished`);
        const value=await post(fetchImpl,'/api/confidence/step',{caseId,jobId:plan.jobId,step,approvedBudgetUsd:plan.budgetUsd},signal);
        results[index]={...finding,hybridConfidence:{...value.hybridConfidence,jobId:plan.jobId,completedSteps:value.completed,
          spentUsd:value.spentUsd,votes:value.votes,reviewer:value.reviewer}};
        await save();
        if(value.stopped){halt=signal?.aborted?'CANCELLED':'INCOMPLETE';break;}
      }
    } catch(error) {
      const status=failureStatus(error);
      results[index]={...results[index],hybridConfidence:{...results[index].hybridConfidence,status,score:null}};
      halt=status;
    }
  };
  const active=new Map();
  try {
    while((cursor<results.length||active.size)&&!halt) {
      if(signal?.aborted){halt='CANCELLED';break;}
      while(active.size<2&&cursor<results.length&&!halt) {
        const index=cursor,finding=results[index];
        if(finding.labelDisagreement||!['DIRECT','INFERENTIAL','FALSE_POSITIVE'].includes(finding.type)) {
          results[index]={...finding,hybridConfidence:{...finding.hybridConfidence,status:'REVIEW_REQUIRED'}};
          cursor++;await save();continue;
        }
        try {
          const plan=await post(fetchImpl,'/api/confidence/plan',{caseId,texts,finding,
            allowance:{jobId:allowance.jobId,index:allocation,approvedUsd:allowance.budgetUsd,
              partialApproved:allowance.partialApproved===true,concurrency:2}},signal);
          allocation++;cursor++;
          const running=review({index,plan}).finally(()=>active.delete(index));
          active.set(index,running);
        } catch(error) {
          const status=failureStatus(error);
          // Only reconsider a free plan after an active finding settles. No
          // paid step is retried, and the server still reserves the full cost.
          if(status==='BUDGET_LIMIT'&&active.size)break;
          results[index]={...finding,hybridConfidence:{...finding.hybridConfidence,status,score:null}};
          if(status==='SOURCE_REVIEW_REQUIRED'){cursor++;await save();continue;}
          halt=status;
        }
      }
      if(active.size)await Promise.race(active.values());
    }
  } catch(error) { saveFailure=error;halt='INCOMPLETE'; }
  await Promise.all(active.values()); // Drain started requests even when a save fails.
  if(signal?.aborted)halt='CANCELLED';
  if(saveFailure)throw saveFailure;
  if(halt)results=results.map(f=>['PENDING','INCOMPLETE'].includes(f.hybridConfidence.status)?
    {...f,hybridConfidence:{...f.hybridConfidence,status:halt,score:null}}:f);
  await save();
  return {results,status:halt??'FINISHED',checked:results.filter(f=>['EXPERIMENTAL','UNCALIBRATED','CALIBRATED'].includes(f.hybridConfidence.status)).length};
}
