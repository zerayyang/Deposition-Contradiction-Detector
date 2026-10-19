import {HYBRID_VERSION} from '../../shared/hybridConfidence.js';

async function post(fetchImpl,url,body,signal) {
  const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const value=await response.json();
  if(!response.ok){const error=new Error(value.error??'Confidence review stopped.');error.code=value.code;throw error;}
  return value;
}
export const prepareConfidenceAllowance=(body,{fetchImpl=fetch,signal}={})=>post(fetchImpl,'/api/confidence/allowance',body,signal);

export async function runAutomaticConfidence({findings,texts,caseId,allowance,fetchImpl=fetch,signal,onCheckpoint=async()=>{},onProgress=()=>{}}) {
  let results=findings.map(f=>({...f,hybridConfidence:{version:HYBRID_VERSION,originalType:f.type,status:'PENDING',score:null}}));
  let allocation=0,halt=null;
  const save=async()=>onCheckpoint(results);
  for(let i=0;i<results.length;i++) {
    if(signal?.aborted){halt='CANCELLED';break;}
    const finding=results[i];
    if(finding.labelDisagreement||!['DIRECT','INFERENTIAL','FALSE_POSITIVE'].includes(finding.type)){
      results[i]={...finding,hybridConfidence:{...finding.hybridConfidence,status:'REVIEW_REQUIRED'}};await save();continue;
    }
    try {
      const plan=await post(fetchImpl,'/api/confidence/plan',{caseId,texts,finding,
        allowance:{jobId:allowance.jobId,index:allocation,approvedUsd:allowance.budgetUsd}},signal);
      allocation++;
      for(let step=0;step<7;step++) {
        signal?.throwIfAborted();onProgress(`Checking confidence · finding ${i+1} of ${results.length} · ${step+1} of 7 checks`);
        const value=await post(fetchImpl,'/api/confidence/step',{caseId,jobId:plan.jobId,step,approvedBudgetUsd:plan.budgetUsd},signal);
        results[i]={...finding,hybridConfidence:{...value.hybridConfidence,jobId:plan.jobId,completedSteps:value.completed,
          spentUsd:value.spentUsd,votes:value.votes,reviewer:value.reviewer}};
        await save();
        if(value.stopped){halt='INCOMPLETE';break;}
      }
      if(halt)break;
    } catch(error) {
      const status=signal?.aborted?'CANCELLED':error.code==='ALLOWANCE_USED'?'BUDGET_LIMIT':error.code==='SOURCE_REVIEW_REQUIRED'?'SOURCE_REVIEW_REQUIRED':'INCOMPLETE';
      results[i]={...results[i],hybridConfidence:{...results[i].hybridConfidence,status,score:null}};
      if(status==='SOURCE_REVIEW_REQUIRED'){await save();continue;}
      halt=status;break;
    }
  }
  if(halt)results=results.map(f=>f.hybridConfidence.status==='PENDING'?{...f,hybridConfidence:{...f.hybridConfidence,status:halt,score:null}}:f);
  await save();
  return {results,status:halt??'FINISHED',checked:results.filter(f=>['EXPERIMENTAL','UNCALIBRATED','CALIBRATED'].includes(f.hybridConfidence.status)).length};
}
