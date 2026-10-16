import fs from 'node:fs';
import {providerOutputFormat} from './structuredOutput.js';
import {decodeEventJson} from './jsonTransport.js';
import {createHash} from 'node:crypto';
import {MODEL,sectionDocument,validateDocuments} from '../documentAnalysis.js';
import {parseTestimonySource} from '../testimonySource.js';
import {createMeasuredModel} from '../runtimeControls.js';
import {utf8Bytes,DOCUMENT_LIMITS} from '../../shared/documentLimits.js';
import {extractionWireSchema,parseExtractionMessage,materializeExtraction,validateEventRecords} from './extractionProtocol.js';

const prompt=fs.readFileSync(new URL('./EXTRACTION_PROMPT.md',import.meta.url),'utf8');
const builtPlans=new WeakSet();
const outputFormat=providerOutputFormat(extractionWireSchema);
const system=prompt+'\nOutput transport schema:\n'+JSON.stringify(extractionWireSchema);
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const round=n=>Math.round(n*1e6)/1e6;
const planHash=plan=>hash(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='id')));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function positive(value,name){if(!Number.isSafeInteger(value)||value<1)throw new Error(`${name} must be a positive integer.`);return value;}
function requestParams(plan,task){return {model:plan.model.id,max_tokens:plan.outputTokens,system:plan.system,output_config:{format:plan.outputFormat,effort:plan.effort},messages:[{role:'user',content:JSON.stringify(task.input)}]};}

export function buildEventExtractionPlan(inputs,{chunkBytes=8000,overlapBytes=1000,outputTokens=32768,maxWitnessUnits=12,maxRequests=512,timeoutMs=120000}={}) {
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>2)throw new Error('Provide one or two complete documents.');
  positive(maxWitnessUnits,'maxWitnessUnits');positive(chunkBytes,'chunkBytes');positive(outputTokens,'outputTokens');positive(maxRequests,'maxRequests');positive(timeoutMs,'timeoutMs');
  if(!Number.isSafeInteger(overlapBytes)||overlapBytes<0||overlapBytes>=chunkBytes)throw new Error('overlapBytes must be smaller than chunkBytes and nonnegative.');
  if(outputTokens>MODEL.maxOutputTokens)throw new Error('Output budget exceeds the existing model policy.');
  const ids=new Set(),documents=[],tasks=[];let inputBytes=0;
  for(const [documentIndex,input] of inputs.entries()) {
    if(typeof input?.documentId!=='string'||!input.documentId.trim()||ids.has(input.documentId))throw new Error('Each document needs a unique nonempty documentId.');ids.add(input.documentId);
    // Reuse the app PDF hash/page/OCR checks. Extraction validates each complete
    // document independently; no comparison or synthetic second model input.
    const manifest=validateDocuments([input.text,input.text],[input,input])[0];
    const index=parseTestimonySource(input.text,{speakerRoles:input.speakerRoles,manifest});
    if(index.diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'))throw new Error(`Document ${input.documentId} has unresolved speaker labels; supply reviewed speakerRoles before extraction.`);
    if(!index.turns.some(t=>t.role==='WITNESS'&&input.text.slice(t.contentStart,t.end).trim()))throw new Error(`Document ${input.documentId} has no supported witness spans.`);
    const source={documentId:input.documentId,text:input.text,pages:structuredClone(manifest?.pages??null),speakerRoles:structuredClone(input.speakerRoles??{}),documentSha256:hash(input.text),sourceDiagnostics:index.diagnostics};
    const turns=index.turns.map((t,i)=>({...t,id:`unit:${i}`}));
    const chunks=sectionDocument(input.text,{chunkBytes,overlapBytes,maxWitnessUnits,speakerRoles:input.speakerRoles,manifest});
    for(const chunk of chunks) {
      const visible=new Map();
      const include=(turn,start,end,assigned=false)=>{
        const old=visible.get(turn.id);
        const a=old?Math.min(start,old.start):start,b=old?Math.max(end,old.end):end;
        visible.set(turn.id,{id:turn.id,role:turn.role,speaker:turn.speaker??null,roleOrigin:turn.roleOrigin??'QA_LABEL',start:a,end:b,text:input.text.slice(a,b),assigned:assigned||old?.assigned||false,
          questionUnitId:turn.role==='WITNESS'&&turn.question?turns.find(t=>t.role==='QUESTION'&&t.contentStart===turn.question.start)?.id??null:null});
      };
      for(const turn of turns) {
        if(!['WITNESS','QUESTION'].includes(turn.role)||turn.end<=chunk.start||turn.contentStart>=chunk.end)continue;
        const start=Math.max(turn.contentStart,chunk.start),end=Math.min(turn.end,chunk.end);
        if(end<=start)continue;
        const assigned=turn.role==='WITNESS'&&end>chunk.coreStart&&start<chunk.coreEnd;
        include(turn,start,end,assigned);
        if(turn.role==='WITNESS'&&turn.question){
          if(utf8Bytes(turn.question.text)>DOCUMENT_LIMITS.questionBytes)throw new Error('A governing question exceeds the supported context budget; no text was shortened.');
          const q=turns.find(t=>t.role==='QUESTION'&&t.contentStart===turn.question.start);
          if(q)include(q,q.contentStart,q.end);
        }
      }
      const task={id:`${documentIndex}:${chunk.id}`,index:chunk.id,documentIndex,coreStart:chunk.coreStart,coreEnd:chunk.coreEnd,
        mode:[...visible.values()].some(s=>s.role==='WITNESS'&&s.assigned)?'MODEL':'LOCAL_NON_WITNESS',
        input:{documentId:input.documentId,documentSha256:source.documentSha256,range:{start:chunk.start,end:chunk.end,coreStart:chunk.coreStart,coreEnd:chunk.coreEnd},text:chunk.text,sources:[...visible.values()]}};
      if(task.mode==='MODEL'){
        const bytes=utf8Bytes(system)+utf8Bytes(JSON.stringify(outputFormat))+utf8Bytes(JSON.stringify(task.input));
        if(bytes+8192+outputTokens>MODEL.contextTokens)throw new Error('Extraction request exceeds the conservative context budget; no source text was truncated.');
        inputBytes+=bytes;
      }
      tasks.push(task);
    }
    documents.push(source);
  }
  const requestCount=tasks.filter(t=>t.mode==='MODEL').length;
  if(requestCount>maxRequests)throw new Error(`Extraction needs ${requestCount} requests, above the configured cap of ${maxRequests}. No calls started.`);
  const plan={version:1,model:MODEL,system,outputFormat,promptSha256:hash(prompt),wireSchemaSha256:hash(extractionWireSchema),documents,tasks,requestCount,outputTokens,maxWitnessUnits,effort:'medium',timeoutMs,
    cost:{currency:'USD',estimated:round((Math.ceil(inputBytes/3)*MODEL.inputUsdPerMillion+requestCount*Math.min(2500,outputTokens)*MODEL.outputUsdPerMillion)/1e6),
      conservativeBudget:round(((inputBytes+requestCount*8192)*MODEL.inputUsdPerMillion+requestCount*outputTokens*MODEL.outputUsdPerMillion)/1e6),
      note:`Local UTF-8 estimates and existing standard model rates; not tokenization or verified billing. Estimate assumes up to 2,500 output tokens/call; budget reserves ${outputTokens} including thinking. No retries; in-flight cancellation can still be billed.`}};
  const built=freeze({...plan,id:planHash(plan)});builtPlans.add(built);return built;
}
export function previewEventExtractionPlan(plan) {
  return {id:plan.id,requestCount:plan.requestCount,model:plan.model.id,cost:plan.cost,
    documents:plan.documents.map((d,i)=>({documentId:d.documentId,characters:d.text.length,pages:d.pages?.length??null,sections:plan.tasks.filter(t=>t.documentIndex===i).length,sourceDiagnostics:d.sourceDiagnostics})),
    notice:'Extraction only; events are proposed meanings. No comparisons, confidence, exhaustive recall guarantee or paid calls have started.'};
}
function usageFor(message){
  const u=message?.usage,known=Number.isSafeInteger(u?.input_tokens)&&u.input_tokens>=0&&Number.isSafeInteger(u?.output_tokens)&&u.output_tokens>=0;
  return {known,inputTokens:known?u.input_tokens:null,outputTokens:known?u.output_tokens:null,
    cacheCreationInputTokens:u?.cache_creation_input_tokens??0,cacheReadInputTokens:u?.cache_read_input_tokens??0};
}
export async function executeEventExtraction({plan,approval,callModel,signal,onEvent=()=>{},cachedResponses=new Map(),maxNewRequests=Infinity}) {
  if(!plan||!builtPlans.has(plan)||plan.id!==planHash(plan)||plan.system!==system)throw new Error('Extraction plan changed or is stale; rebuild and review it.');
  if(approval?.planId!==plan.id||approval?.requestCount!==plan.requestCount||!Number.isFinite(approval?.maxUsd)||approval.maxUsd<plan.cost.conservativeBudget)throw new Error('Explicit approval of this exact plan, request count and conservative USD budget is required.');
  if(typeof callModel!=='function')throw new Error('Supply the existing model transport explicitly.');
  const started=performance.now(),tasks=plan.tasks.map(t=>({...t,status:'PENDING',events:[],rejected:[],issues:[]}));
  // Restore every completed task before emitting a checkpoint, so a crash
  // during replay cannot erase later completed work and cause repeat charges.
  for(const task of tasks){const message=cachedResponses.get(hash(task.input));if(!message)continue;
    task.usage=usageFor(message);task.stopReason=message.stop_reason;
    task.rawText=message.content.filter(b=>b.type==='text').map(b=>b.text).join('');task.responseSha256=hash(task.rawText);
    task.response=parseExtractionMessage(message);task.responseFormat=decodeEventJson(task.rawText).format;Object.assign(task,materializeExtraction(task.response,task,plan.documents[task.documentIndex]));
    if(task.issues.length)throw new Error('Saved completed extraction failed fresh validation. No new paid calls started.');
    task.status='COMPLETE';task.attempted=true;task.reused=true;
  }
  const model=createMeasuredModel(callModel,{timeoutMs:plan.timeoutMs});let cancelled=false;
  const snapshot=()=>{
    const attempts=tasks.filter(t=>t.attempted),allKnown=attempts.every(t=>t.usage?.known),uncached=attempts.every(t=>!t.usage?.cacheCreationInputTokens&&!t.usage?.cacheReadInputTokens);
    const inputTokens=attempts.reduce((n,t)=>n+(t.usage?.inputTokens??0),0),outputTokens=attempts.reduce((n,t)=>n+(t.usage?.outputTokens??0),0);
    const complete=tasks.every(t=>t.status==='COMPLETE'),some=tasks.some(t=>t.status==='COMPLETE'&&t.mode==='MODEL'||t.events.length);
    return {status:cancelled?'CANCELLED':complete?'COMPLETE':some?'PARTIAL':'FAILED',planId:plan.id,
      documents:plan.documents.map((d,i)=>{
        const own=tasks.filter(t=>t.documentIndex===i),events=own.flatMap(t=>t.events),validation=validateEventRecords(events,d);
        const segments=own.map(t=>({start:t.coreStart,end:t.coreEnd,status:t.status==='COMPLETE'?'PROCESSED':t.attempted?'FAILED':'UNPROCESSED',eventIds:t.events.map(e=>e.id),reason:t.status==='COMPLETE'?null:t.error??t.issues[0]?.message??'Not processed.'}));
        return {documentId:d.documentId,documentSha256:d.documentSha256,events,recordValidation:validation,sourceDiagnostics:d.sourceDiagnostics,
          coverage:{status:segments.every(s=>s.status==='PROCESSED')?'COMPLETE':segments.some(s=>s.status==='PROCESSED')?'PARTIAL':'FAILED',segments},
          notice:'Coverage records assigned-range processing, not exhaustive event recall. These records are not a promoted comparison or scored finding.'};
      }),
      tasks:tasks.map(({input,...t})=>({...t,inputSha256:hash(input)})),
      usage:{attempted:attempts.length,planned:plan.requestCount,inputTokens:allKnown?inputTokens:null,outputTokens:allKnown?outputTokens:null,unavailableRequests:attempts.filter(t=>!t.usage?.known).length,
        estimatedUsd:allKnown&&uncached?round((inputTokens*plan.model.inputUsdPerMillion+outputTokens*plan.model.outputUsdPerMillion)/1e6):null,
        note:'Usage-based USD estimate at configured rates, not verified billing or Codex credits; missing usage or unpriced cache usage leaves cost unknown.'},
      elapsedMs:Math.round(performance.now()-started),provenance:{model:plan.model.id,promptSha256:plan.promptSha256,wireSchemaSha256:plan.wireSchemaSha256,pipeline:'event-extraction-v1'},
      notice:'Proposed event meanings need evaluation. No contradiction labels or numeric confidence are supplied by this workflow.'};
  };
  const emit=async event=>{try{await onEvent(structuredClone(event));}catch(error){error.extractionResult=snapshot();throw error;}};
  await emit({event:'start',plan:previewEventExtractionPlan(plan)});
  let newRequests=0;
  for(const task of tasks){
    if(task.status==='COMPLETE')continue;
    if(newRequests>=maxNewRequests&&task.mode!=='LOCAL_NON_WITNESS')break;
    if(signal?.aborted){cancelled=true;break;}
    if(task.mode==='LOCAL_NON_WITNESS'){task.status='COMPLETE';continue;}
    task.status='RUNNING';
    await emit({event:'progress',taskId:task.id,attempted:tasks.filter(t=>t.attempted).length,planned:plan.requestCount});
    if(signal?.aborted){cancelled=true;task.status='CANCELLED';break;}
    task.attempted=true;
    try{
      newRequests++;
      const message=await model(requestParams(plan,task),{signal,maxRetries:0});
      task.usage=usageFor(message);task.stopReason=message?.stop_reason??null;
      task.rawText=Array.isArray(message?.content)?message.content.filter(b=>b.type==='text').map(b=>b.text).join(''):'';
      task.responseSha256=hash(task.rawText);
      task.response=parseExtractionMessage(message);task.responseFormat=decodeEventJson(task.rawText).format;
      Object.assign(task,materializeExtraction(task.response,task,plan.documents[task.documentIndex]));
      task.status=task.issues.length?'PARTIAL':'COMPLETE';
    }catch(error){task.error=error.message??String(error);task.status=signal?.aborted?'CANCELLED':'FAILED';if(signal?.aborted)cancelled=true;}
    await emit({event:'checkpoint',result:snapshot()});
    if(cancelled)break;
  }
  cancelled ||= Boolean(signal?.aborted);
  for(const task of tasks)if(task.status==='PENDING')task.status=cancelled?'CANCELLED':'NOT_ATTEMPTED';
  const result=snapshot();await emit({event:'result',result});return result;
}
