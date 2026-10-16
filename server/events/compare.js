import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MODEL,SECTION_OUTPUT_TOKENS,validateDocuments} from '../documentAnalysis.js';
import {parseTestimonySource} from '../testimonySource.js';
import {createMeasuredModel} from '../runtimeControls.js';
import {utf8Bytes} from '../../shared/documentLimits.js';
import {validateEventRecords} from './extractionProtocol.js';
import {comparisonWireSchema,parseComparisonMessage,validateComparisonResponse} from './comparisonProtocol.js';
const originalInstructions=fs.readFileSync(new URL('../proper_prompts.md',import.meta.url),'utf8');
const stop=originalInstructions.indexOf('## 6. Required Output');
if(stop<0)throw new Error('Existing classification instruction boundary is missing.');
const definitions=originalInstructions.slice(0,stop),instructions=fs.readFileSync(new URL('./COMPARISON_PROMPT.md',import.meta.url),'utf8');
const pipelineSha256=digestSources();
function digestSources(){const hash=createHash('sha256');for(const name of ['compare.js','comparisonProtocol.js','validate.js','extractionProtocol.js','../testimonySource.js','../testimonyMarkers.js','../documentAnalysis.js','../runtimeControls.js'])hash.update(name).update(fs.readFileSync(new URL(name,import.meta.url)));return hash.digest('hex');}
const system=definitions+'\n\n'+instructions+'\nTransport schema:\n'+JSON.stringify(comparisonWireSchema);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const knownPlans=new WeakSet(),round=n=>Math.round(n*1e6)/1e6;
function eventKey(event){
  const sourceKey=s=>stable({role:s.role,start:s.start,end:s.end,quote:s.quote,pageRefs:s.pageRefs});
  const refs=ids=>ids.map(id=>sourceKey(event.sources.find(s=>s.id===id)));
  return JSON.stringify(stable({kind:event.kind,summary:event.summary,assertion:{...event.assertion,sourceIds:refs(event.assertion.sourceIds)},
    attributes:event.attributes.map(a=>({...a,sourceIds:refs(a.sourceIds)})),qualifiers:event.qualifiers.map(q=>({...q,sourceId:refs([q.sourceId])[0]})),
    relations:event.relations,sources:event.sources.map(sourceKey),reviewRequired:event.reviewRequired,unresolvedReasons:event.unresolvedReasons}));
}
function groupEvents(events,documentIndex){
  const groups=[],keys=new Map();
  for(const event of events){const key=eventKey(event);let group=keys.get(key);
    if(!group){group={id:`d${documentIndex}:g${groups.length}`,event:structuredClone(event),members:[]};keys.set(key,group);groups.push(group);}
    group.members.push(structuredClone(event));
  }
  return groups;
}
function sourceView(group,index){
  const contexts=[];
  for(const s of group.event.sources.filter(s=>s.role==='WITNESS')){
    const turn=index.turns.find(t=>t.role==='WITNESS'&&s.start>=t.contentStart&&s.end<=t.end);
    if(!turn)throw new Error('Validated event lost its witness context.');
    const id=`context:${turn.contentStart}:${turn.end}`;
    if(!contexts.some(c=>c.id===id))contexts.push({id,speaker:turn.speaker??null,roleOrigin:turn.roleOrigin,answerStart:turn.contentStart,answerEnd:turn.end,
      answer:index.text.slice(turn.contentStart,turn.end),question:turn.question,workingQuestionHistory:turn.questions});
  }
  return {record:{id:group.id,memberIds:group.members.map(e=>e.id),event:group.event,contextIds:contexts.map(c=>c.id)},contexts};
}
function blockView(groups,graph,views){
  const supporting=new Set(),visited=new Set(groups.map(g=>g.id)),queue=groups.map(g=>g.id);
  while(queue.length){for(const id of graph.get(queue.shift())??[])if(!visited.has(id)){visited.add(id);supporting.add(id);queue.push(id);}}
  const contexts=new Map(),read=id=>{const v=views.get(id);v.contexts.forEach(c=>contexts.set(c.id,c));return v.record;};
  return {records:groups.map(g=>read(g.id)),supportingRecords:[...supporting].map(read),contexts:[...contexts.values()]};
}
function blocks(groups,index,maxEvents,maxBytes){
  const result=[],byMember=new Map(),graph=new Map(groups.map(g=>[g.id,new Set()])),views=new Map(groups.map(g=>[g.id,sourceView(g,index)]));let current=[];
  groups.forEach(g=>g.members.forEach(e=>byMember.set(e.id,g.id)));
  for(const g of groups)for(const r of g.event.relations){
    if(r.targetEventId===null)continue;
    const target=byMember.get(r.targetEventId);if(!target)throw new Error('Event relation target is unavailable.');
    graph.get(g.id).add(target);if(['CORRECTS','QUALIFIES'].includes(r.kind))graph.get(target).add(g.id);
  }
  for(const group of groups){
    const next=[...current,group],view=blockView(next,graph,views);
    if(current.length&&(next.length>maxEvents||utf8Bytes(JSON.stringify(view))>maxBytes)){result.push(blockView(current,graph,views));current=[group];}
    else current=next;
  }
  if(current.length)result.push(blockView(current,graph,views));return result;
}
function validateCoverage(document,text,allowPartial){
  const segments=document.coverage?.segments;
  if(!Array.isArray(segments)||!Array.isArray(document.events))throw new Error('Extraction coverage or events are missing.');
  const ids=new Set(document.events.map(e=>e.id));let end=0;
  for(const s of segments){
    if(!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start!==end||s.end<=s.start||s.end>text.length||!['PROCESSED','FAILED','UNPROCESSED'].includes(s.status))throw new Error('Extraction coverage has a gap, overlap or invalid range.');end=s.end;
    if(!Array.isArray(s.eventIds)||new Set(s.eventIds).size!==s.eventIds.length||s.eventIds.some(id=>!ids.has(id)))throw new Error('Extraction coverage references missing or repeated event IDs.');
    if(s.status!=='PROCESSED'&&(typeof s.reason!=='string'||!s.reason.trim()))throw new Error('Incomplete extraction range lacks a reason.');
  }
  if(end!==text.length)throw new Error('Extraction coverage does not account for the complete source.');
  const status=segments.every(s=>s.status==='PROCESSED')?'COMPLETE':segments.some(s=>s.status==='PROCESSED')?'PARTIAL':'FAILED';
  if(document.coverage.status!==status)throw new Error('Extraction coverage status contradicts its ranges.');
  for(const e of document.events)if(!segments.some(s=>s.eventIds.includes(e.id)&&e.sources?.some(source=>source.role==='WITNESS'&&source.end>s.start&&source.start<s.end)))throw new Error('Extracted event is not linked to its assigned witness core range.');
  if(!allowPartial&&segments.some(s=>s.status!=='PROCESSED'))throw new Error('Extraction is incomplete; explicit partial-extraction review is required.');
}
export function buildEventComparisonPlan({extractionPlan,extractionResult},{eventsPerBlock=64,blockBytes=128000,maxRequests=128,maxPairs=1000000,outputTokens=SECTION_OUTPUT_TOKENS,timeoutMs=120000,sameWitnessConfirmed=false,allowPartialExtraction=false}={}){
  for(const [name,value] of Object.entries({eventsPerBlock,blockBytes,maxRequests,maxPairs,outputTokens,timeoutMs}))if(!Number.isSafeInteger(value)||value<1)throw new Error(`${name} must be a positive integer.`);
  if(eventsPerBlock>128)throw new Error('At most 128 primary events per block are supported; no events were discarded.');
  if(typeof sameWitnessConfirmed!=='boolean'||typeof allowPartialExtraction!=='boolean')throw new Error('Identity and partial-extraction flags must be explicit booleans.');
  if(outputTokens>MODEL.maxOutputTokens)throw new Error('Comparison output budget exceeds existing model policy.');
  if(!['COMPLETE','PARTIAL','FAILED','CANCELLED'].includes(extractionResult?.status))throw new Error('Unknown extraction status.');
  if(extractionPlan?.documents?.length!==2||extractionResult?.documents?.length!==2||extractionResult.planId!==extractionPlan.id)throw new Error('Supply two original sources and the matching extraction result/plan.');
  if(extractionResult.status!=='COMPLETE'&&!allowPartialExtraction)throw new Error('Extraction is incomplete; explicit partial-extraction review is required.');
  const sourceDocuments=[],catalogs=[],indexes=[];
  for(const [i,source] of extractionPlan.documents.entries()){
    const extracted=extractionResult.documents[i];
    if(extracted.documentId!==source.documentId||extracted.documentSha256!==digest(source.text)||source.documentSha256!==digest(source.text))throw new Error('Extraction provenance does not match the original source.');
    validateDocuments([source.text,source.text],source.pages?[{extraction:{textSha256:source.documentSha256,textLength:source.text.length,pageCount:source.pages.length,pages:source.pages}},{extraction:{textSha256:source.documentSha256,textLength:source.text.length,pageCount:source.pages.length,pages:source.pages}}]:[]);
    validateCoverage(extracted,source.text,allowPartialExtraction);
    if(!Array.isArray(extracted.events))throw new Error('Extraction events are missing.');
    const checked=validateEventRecords(extracted.events,source);if(!checked.valid)throw new Error('Extraction events failed fresh deterministic source validation: '+JSON.stringify(checked.errors));
    const index={...parseTestimonySource(source.text,{speakerRoles:source.speakerRoles}),text:source.text};
    if(index.diagnostics.some(d=>d.code==='UNKNOWN_SPEAKER'))throw new Error('Source roles are unresolved.');
    const groups=groupEvents(extracted.events,i);catalogs.push(groups);indexes.push(index);
    sourceDocuments.push({documentId:source.documentId,documentSha256:source.documentSha256,extractionCoverage:structuredClone(extracted.coverage),sourceDiagnostics:index.diagnostics,
      eventCount:extracted.events.length,groupCount:groups.length,duplicatesGrouped:extracted.events.length-groups.length});
  }
  const pairCount=catalogs[0].length*catalogs[1].length;
  if(pairCount>maxPairs)throw new Error(`Comparison needs ${pairCount} event pairs, above the configured cap. No paid calls started; nothing was omitted.`);
  const views=catalogs.map((groups,i)=>blocks(groups,indexes[i],eventsPerBlock,blockBytes)),requestCount=views[0].length*views[1].length;
  if(pairCount>maxPairs||requestCount>maxRequests)throw new Error(`Comparison needs ${pairCount} event pairs in ${requestCount} requests, above the configured cap. No paid calls started; nothing was omitted.`);
  const tasks=[];let inputBytes=0;
  for(const [a,left] of views[0].entries())for(const [b,right] of views[1].entries()){
    const input={sameWitnessConfirmed,left,right},bytes=utf8Bytes(system)+utf8Bytes(JSON.stringify(input));
    if(bytes+8192+outputTokens>MODEL.contextTokens)throw new Error('A comparison request exceeds the conservative context budget; source context was not shortened.');
    inputBytes+=bytes;tasks.push({id:`${a}:${b}`,input,pairCount:left.records.length*right.records.length});
  }
  const upstreamIncomplete=extractionResult.status!=='COMPLETE'||sourceDocuments.some(d=>d.extractionCoverage.segments.some(s=>s.status!=='PROCESSED'));
  const base={version:1,pipelineSha256,model:MODEL,system,classificationSha256:digest(definitions),promptSha256:digest(instructions),schemaSha256:digest(comparisonWireSchema),
    extractionPlanId:extractionPlan.id,extractionResultSha256:digest(extractionResult),documents:sourceDocuments,catalogs,tasks,requestCount,pairCount,outputTokens,timeoutMs,sameWitnessConfirmed,upstreamIncomplete,
    cost:{currency:'USD',estimated:round((Math.ceil(inputBytes/3)*MODEL.inputUsdPerMillion+requestCount*Math.min(2500,outputTokens)*MODEL.outputUsdPerMillion)/1e6),
      conservativeBudget:round(((inputBytes+requestCount*8192)*MODEL.inputUsdPerMillion+requestCount*outputTokens*MODEL.outputUsdPerMillion)/1e6),
      note:'Local UTF-8 estimate at existing uncached rates, not verified billing. Output reserve includes thinking. No retries; cancelled in-flight work can still be billed.'}};
  const built=freeze({...base,id:digest(base)});knownPlans.add(built);return built;
}
export function previewEventComparisonPlan(plan){return {id:plan.id,requestCount:plan.requestCount,pairCount:plan.pairCount,cost:plan.cost,model:plan.model.id,documents:plan.documents,sameWitnessConfirmed:plan.sameWitnessConfirmed,upstreamIncomplete:plan.upstreamIncomplete,
  notice:'Every primary event block crosses every block in the other document. Processing coverage is not semantic recall. Empty extraction can conceal missed events; no score is produced.'};}
function combineComparisons(tasks){
  const groups=new Map();
  for(const task of tasks)for(const c of task.comparisons){
    const literal=sources=>sources.map(s=>({role:s.role,start:s.start,end:s.end,quote:s.quote}));
    const key=JSON.stringify([c.leftId,c.rightId,c.type,c.issue,literal(c.leftSources),literal(c.rightSources)]);
    let group=groups.get(key);
    if(!group){group={id:digest(key),type:c.type,issue:c.issue,leftSources:c.leftSources,rightSources:c.rightSources,variants:[],supportingPairs:[],reviewRequired:false};groups.set(key,group);}
    group.variants.push(structuredClone(c));group.supportingPairs.push({taskId:task.id,leftId:c.leftId,rightId:c.rightId});group.reviewRequired ||=c.reviewRequired;
  }
  const merged=[...groups.values()].map(g=>({...g,report:g.variants.some(v=>v.report),reportDisagreement:g.variants.some(v=>v.report)!==g.variants.every(v=>v.report),
    reviewRequired:g.reviewRequired||g.variants.some(v=>v.report)!==g.variants.every(v=>v.report)}));
  const types=new Map(),baseKey=g=>JSON.stringify([g.variants[0].pairId,g.issue,g.leftSources,g.rightSources]);
  for(const g of merged){const key=baseKey(g);if(!types.has(key))types.set(key,new Set());types.get(key).add(g.type);}
  return merged.map(g=>{const alternatives=[...types.get(baseKey(g))];return {...g,typeDisagreement:alternatives.length>1,typeAlternatives:alternatives,reviewRequired:g.reviewRequired||alternatives.length>1};});
}
export async function executeEventComparison({plan,approval,callModel,signal,onEvent=()=>{}}){
  if(!knownPlans.has(plan)||plan.system!==system)throw new Error('Comparison requires a fresh immutable plan built by this module.');
  if(approval?.planId!==plan.id||approval?.requestCount!==plan.requestCount||!Number.isFinite(approval?.maxUsd)||approval.maxUsd<plan.cost.conservativeBudget)throw new Error('Explicit approval of this comparison plan, request count and budget is required.');
  if(typeof callModel!=='function')throw new Error('Model transport is required.');
  const model=createMeasuredModel(callModel,{timeoutMs:plan.timeoutMs}),started=performance.now();let cancelled=false;
  const tasks=plan.tasks.map(t=>({...t,status:'PENDING',comparisons:[],pairs:[],unrelated:[],issues:[],rejected:[],accountedPairs:0}));
  const snapshot=()=>{
    const attempted=tasks.filter(t=>t.attempted),known=attempted.every(t=>t.usage?.known),uncached=attempted.every(t=>!t.usage?.cacheCreation&&!t.usage?.cacheRead);
    const input=attempted.reduce((n,t)=>n+(t.usage?.inputTokens??0),0),output=attempted.reduce((n,t)=>n+(t.usage?.outputTokens??0),0);
    const complete=tasks.every(t=>t.status==='COMPLETE'),comparisons=combineComparisons(tasks);
    return {status:cancelled?'CANCELLED':complete&&!plan.upstreamIncomplete?'COMPLETE':tasks.some(t=>t.status==='COMPLETE'||t.comparisons.length||t.accountedPairs>0&&(t.unrelated.length||t.pairs.some(p=>p.relation==='UNRESOLVED')))||complete&&plan.upstreamIncomplete?'PARTIAL':'FAILED',planId:plan.id,
      context:{sameWitnessConfirmed:plan.sameWitnessConfirmed},documents:plan.documents,catalogs:plan.catalogs,comparisons,findings:comparisons.filter(c=>c.report),
      coverage:{plannedPairs:plan.pairCount,accountedPairs:tasks.reduce((n,t)=>n+t.accountedPairs,0),plannedRequests:plan.requestCount,completedRequests:tasks.filter(t=>t.status==='COMPLETE').length,
        upstreamIncomplete:plan.upstreamIncomplete,extractionPlanId:plan.extractionPlanId,notice:'Accounted means a model disposition exists, not that it is correct. Candidate/matching errors can remain in unrelated declarations.'},
      tasks:tasks.map(({input,...t})=>({...t,assignment:{leftIds:input.left.records.map(r=>r.id),rightIds:input.right.records.map(r=>r.id)},inputSha256:digest(input)})),
      usage:{attempted:attempted.length,inputTokens:known?input:null,outputTokens:known?output:null,unavailableRequests:attempted.filter(t=>!t.usage?.known).length,
        estimatedUsd:known&&uncached?round((input*MODEL.inputUsdPerMillion+output*MODEL.outputUsdPerMillion)/1e6):null,note:'Configured-rate USD estimate, not verified billing or Codex credits.'},
      provenance:{pipeline:'event-comparison-v1',pipelineSha256:plan.pipelineSha256,schemaSha256:plan.schemaSha256,classificationSha256:plan.classificationSha256,promptSha256:plan.promptSha256,extractionPlanId:plan.extractionPlanId,extractionResultSha256:plan.extractionResultSha256,model:plan.model.id},
      elapsedMs:Math.round(performance.now()-started),notice:'Proposed AI categories and relationships, source-verified only. No numeric confidence is computed. Active website integration remains a later step.'};
  };
  const emit=async e=>{try{await onEvent(structuredClone(e));}catch(error){error.comparisonResult=structuredClone(snapshot());throw error;}};
  await emit({event:'start',plan:previewEventComparisonPlan(plan)});
  for(const task of tasks){
    if(signal?.aborted){cancelled=true;break;}
    task.status='RUNNING';await emit({event:'progress',taskId:task.id,planned:plan.requestCount});
    if(signal?.aborted){cancelled=true;task.status='CANCELLED';break;}
    task.attempted=true;
    try{
      const message=await model({model:plan.model.id,max_tokens:plan.outputTokens,system,messages:[{role:'user',content:JSON.stringify(task.input)}]},{signal,maxRetries:0});
      const usage=message?.usage;task.usage={known:Number.isSafeInteger(usage?.input_tokens)&&usage.input_tokens>=0&&Number.isSafeInteger(usage?.output_tokens)&&usage.output_tokens>=0,inputTokens:usage?.input_tokens,outputTokens:usage?.output_tokens,cacheCreation:usage?.cache_creation_input_tokens??0,cacheRead:usage?.cache_read_input_tokens??0};
      task.rawText=Array.isArray(message?.content)?message.content.filter(b=>b.type==='text').map(b=>b.text).join(''):'';task.responseSha256=digest(task.rawText);task.stopReason=message?.stop_reason??null;
      task.response=parseComparisonMessage(message);Object.assign(task,validateComparisonResponse(task.response,task));task.status=task.issues.length?'PARTIAL':'COMPLETE';
    }catch(error){task.error=error.message??String(error);task.status=signal?.aborted?'CANCELLED':'FAILED';if(signal?.aborted)cancelled=true;}
    await emit({event:'checkpoint',result:snapshot()});if(cancelled)break;
  }
  cancelled ||=Boolean(signal?.aborted);
  for(const task of tasks)if(task.status==='PENDING')task.status=cancelled?'CANCELLED':'NOT_ATTEMPTED';
  const result=structuredClone(snapshot());await emit({event:'result',result});return result;
}
