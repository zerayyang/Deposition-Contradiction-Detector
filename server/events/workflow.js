import {utf8Bytes} from '../../shared/documentLimits.js';
import {requireSpeakerReview} from './sourceRoles.js';
import {createHash} from 'node:crypto';
import {buildEventExtractionPlan,previewEventExtractionPlan,executeEventExtraction} from './extract.js';
import {buildEventComparisonPlan,previewEventComparisonPlan,executeEventComparison} from './compare.js';
import {parseExtractionMessage,materializeExtraction} from './extractionProtocol.js';
import {scoreEventComparisons} from './scoringAdapter.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const approval=plan=>({planId:plan.id,requestCount:plan.requestCount,maxUsd:plan.cost.conservativeBudget});
function cachedMessage(task){return {stop_reason:task.stopReason,content:[{type:'text',text:task.rawText}],usage:{input_tokens:task.usage?.inputTokens,output_tokens:task.usage?.outputTokens,cache_creation_input_tokens:task.usage?.cacheCreationInputTokens??task.usage?.cacheCreation??0,cache_read_input_tokens:task.usage?.cacheReadInputTokens??task.usage?.cacheRead??0}};}
// Replaying saved raw responses re-runs all schema/source checks. Accepted arrays,
// labels, offsets, counts and scores supplied by a browser are never trusted.
async function replayExtraction(plan,saved){
 if(saved?.planId!==plan.id)throw new Error('Saved event extraction belongs to different sources, role mappings or instructions. Start a new extraction explicitly.');
 const byInput=new Map(saved.tasks.filter(t=>t.status==='COMPLETE'&&t.mode==='MODEL').map(t=>[t.inputSha256,t]));
 return executeEventExtraction({plan,approval:approval(plan),callModel:async params=>{
  const task=byInput.get(hash(JSON.parse(params.messages[0].content)));if(!task)throw new Error('Saved extraction is incomplete; no comparison was started.');return cachedMessage(task);
 }});
}
export async function prepareEventWorkflow(body,{codeFingerprint='local-test',maxRequests=12,maxBudgetUsd=25,approvedMemory=null,checkMemory=null}={}){
 if(body?.useApprovedMemory!==undefined&&typeof body.useApprovedMemory!=='boolean')throw new Error('Memory preference must be a boolean.');
 if(body?.phase==='compare'&&body.useApprovedMemory&&!approvedMemory)throw new Error('Approved memory must be checked by the server before comparison.');
 const phase=body?.phase??'extract';if(!['extract','compare'].includes(phase))throw new Error('Choose extraction or comparison.');
 if(typeof body?.sameWitnessConfirmed!=='boolean')throw new Error('Review whether both documents concern the same witness.');
 const sourceOptions=body.speakerRoles??[{},{}];
 if(!Array.isArray(sourceOptions)||sourceOptions.length!==2)throw new Error('Supply two reviewed speaker-role maps.');
 [body.transcript1,body.transcript2].forEach((text,i)=>requireSpeakerReview(text,sourceOptions[i]));
 const extractionPlan=buildEventExtractionPlan([body.transcript1,body.transcript2].map((text,i)=>({documentId:`transcript-${i+1}`,text,extraction:body.documents?.[i]?.extraction,pageMappingStale:body.documents?.[i]?.pageMappingStale,speakerRoles:sourceOptions[i]})),{maxRequests});
 const state=body.eventState;
 // Fresh plan IDs, raw schema/source validation and comparison pipeline hashes
 // govern reuse. A deployment fingerprint alone must not force repeated charges.
 if(state&&state.extraction?.planId!==extractionPlan.id)throw new Error('Saved extraction belongs to different sources, roles or instructions. Start a new reading plan; existing results remain available.');
 let extraction=null,plan=extractionPlan;
 if(phase==='compare'){
  if(!state?.extraction||state.extraction.status!=='COMPLETE')throw new Error('Finish complete event extraction before comparing. Partial extraction remains available for review.');
  extraction=await replayExtraction(extractionPlan,state.extraction);
  extraction.elapsedMs=state.extraction.elapsedMs;
  if(extraction.status!=='COMPLETE')throw new Error('Saved raw extraction did not pass fresh validation. No paid comparison started.');
  plan=buildEventComparisonPlan({extractionPlan,extractionResult:extraction},{sameWitnessConfirmed:body.sameWitnessConfirmed,maxRequests,approvedMemory:body.useApprovedMemory?approvedMemory:null});
 }
 const saved=phase==='extract'?state?.extraction:state?.comparison;
 // Only matching successful raw responses can be replayed. Partial/failed tasks
 // are retried solely after a fresh displayed approval; no automatic retries.
 const cache=new Map();
 if(saved?.planId===plan.id)for(const t of saved.tasks??[]){
  if(!t.rawText||t.stopReason!=='end_turn')continue;
  if(phase==='extract'){
   const task=plan.tasks.find(task=>hash(task.input)===t.inputSha256);if(!task)continue;
   try{const parsed=parseExtractionMessage(cachedMessage(t)),checked=materializeExtraction(parsed,task,plan.documents[task.documentIndex]);
    if(!checked.issues.length)cache.set(t.inputSha256,t);else if(t.status==='COMPLETE')throw new Error('Invalid completed cache.');
   }catch{if(t.status==='COMPLETE')throw new Error('Saved completed extraction failed fresh validation. No new paid calls started.');}
  }else if(t.status==='COMPLETE')cache.set(t.inputSha256,t);
 }
 const paidTasks=plan.tasks.filter(t=>t.mode!=='LOCAL_NON_WITNESS'&&!cache.has(hash(t.input)));
 // Reprice each remaining request from its actual prompt bytes. Never average
 // unequal request sizes or bill cached work as new provider requests.
 const inputBytes=paidTasks.reduce((sum,t)=>sum+utf8Bytes(plan.system)+utf8Bytes(JSON.stringify(plan.outputFormat))+utf8Bytes(JSON.stringify(t.input)),0);
 const round=n=>Math.round(n*1e6)/1e6;
 const cost={currency:'USD',estimated:round((Math.ceil(inputBytes/3)*plan.model.inputUsdPerMillion+paidTasks.length*Math.min(2500,plan.outputTokens)*plan.model.outputUsdPerMillion)/1e6),
 conservativeBudget:round(((inputBytes+paidTasks.length*8192)*plan.model.inputUsdPerMillion+paidTasks.length*plan.outputTokens*plan.model.outputUsdPerMillion)/1e6),note:'Local uncached UTF-8 estimate for new requests only, not verified billing. Output includes thinking; no automatic retries. In-flight cancellation can still be billed.'};
 const base=phase==='extract'?previewEventExtractionPlan(plan):previewEventComparisonPlan(plan);
 const preview={...base,phase,workflow:'events-v1',requestCount:paidTasks.length,totalRequestCount:plan.requestCount,cachedRequests:cache.size,resuming:cache.size>0,
  documents:base.documents.map(d=>({...d,pages:d.pages??null,sections:d.sections??null})),
  cost,
  nextPhase:phase==='extract'?'Comparison count and price require separate approval after extraction.':null};
 if(preview.requestCount>maxRequests||preview.cost.conservativeBudget>maxBudgetUsd)throw new Error(`Event phase exceeds the server allowance (${maxRequests} requests / USD ${maxBudgetUsd}). Nothing was omitted and no paid call started.`);
 return {phase,plan,extractionPlan,extraction,cache,preview,codeFingerprint,checkMemory};
}
export async function executeEventWorkflow({prepared,body,callModel,signal,onEvent=()=>{},maxNewRequests=Infinity}){
 const {phase,plan,extractionPlan,extraction,cache,codeFingerprint}=prepared;
 let paidRequests=0;const started=performance.now();
 const invoke=async(params,options)=>{const cached=cache.get(hash(JSON.parse(params.messages[0].content)));if(cached)return cachedMessage(cached);if(prepared.checkMemory)await prepared.checkMemory();options?.signal?.throwIfAborted();paidRequests++;return callModel(params,options);};
 const materialize=(raw,running=false)=>{
  const eventState={version:1,codeFingerprint,speakerRoles:body.speakerRoles??[{},{}],sameWitnessConfirmed:body.sameWitnessConfirmed,
   extraction:phase==='extract'?raw:extraction,comparison:phase==='compare'?raw:null};
  const all=phase==='compare'?scoreEventComparisons(raw,extractionPlan):[];
  const tasks=raw.tasks.filter(t=>t.mode!=='LOCAL_NON_WITNESS').map(t=>({id:t.id,reused:Boolean(t.reused),status:({COMPLETE:'completed',PARTIAL:'partial',FAILED:'failed',RUNNING:'running',PENDING:'pending',CANCELLED:'cancelled',NOT_ATTEMPTED:'not_attempted'})[t.status],error:t.error??t.issues?.map(i=>i.message).join(' '),stopReason:t.stopReason,rejectedFindings:(t.rejected??[]).map((r,i)=>({candidateIndex:i,reason:r.error??'Event or comparison failed source/schema validation.'}))}));
  const status=running?'running':phase==='extract'&&raw.status==='COMPLETE'?'awaiting_comparison':raw.status.toLowerCase();
  return {topicsReviewed:all.map(c=>c.eventDetails.issue),contradictions:all.filter(c=>c.report),analysis:{workflow:'events-v1',phase,status,planned:plan.requestCount,completed:tasks.filter(t=>t.status==='completed').length,failed:tasks.filter(t=>t.status==='failed').length,partial:tasks.filter(t=>t.status==='partial').length,attempted:raw.usage.attempted,paidRequestsThisRun:paidRequests,tasks,coverage:[],issues:[],eventState,
   eventSummary:{documents:eventState.extraction.documents.map(d=>({id:d.documentId,eventCount:d.events.length,coverage:d.coverage})),pairs:raw.coverage??null,allComparisons:all.length,suppressedComparisons:all.filter(c=>!c.report).length,unresolvedPairs:phase==='compare'?raw.tasks.flatMap(t=>t.pairs??[]).filter(p=>p.relation==='UNRESOLVED'||p.reviewRequired&&!p.comparisonIds.length).length:0},
   usage:raw.usage,timing:{elapsedMs:Math.round(performance.now()-started)},provenance:{...raw.provenance,codeFingerprint},notice:'Processing coverage is not proof of semantic completeness. Numeric confidence comes only from existing deterministic rules.'}};
 };
 let latest=null;
 const execute=phase==='extract'?executeEventExtraction:executeEventComparison;
 await execute({plan,approval:approval(plan),callModel:invoke,signal,maxNewRequests,cachedResponses:new Map([...cache].map(([key,task])=>[key,cachedMessage(task)])),onEvent:async event=>{
  if(event.result){latest=materialize(event.result,event.event!=='result');await onEvent({...latest,event:event.event});}
  else await onEvent({...event,phase,total:plan.requestCount,attempted:paidRequests});
 }});
 return latest;
}
