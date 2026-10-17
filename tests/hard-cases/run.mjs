#!/usr/bin/env node
// Answer keys are never passed to application planning or model transport.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {MODEL,buildPlan,executePlan} from '../../server/documentAnalysis.js';
import {prepareEventWorkflow,executeEventWorkflow} from '../../server/events/workflow.js';

const here=new URL('./',import.meta.url);
const money=n=>Math.ceil(n*1e6)/1e6;
export function optionsFor(args){
 const options={method:'direct',split:'all',repeat:1,approveUsd:null,skipDatasets:false};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--skip-datasets'){options.skipDatasets=true;continue;}
  const [key,...parts]=args[i].split('=');
  if(!['--method','--split','--repeat','--approve-usd'].includes(key))throw new Error('Unknown argument. Use --method direct|events --split tuning|heldout|all --repeat N [--skip-datasets] [--approve-usd=CAP].');
  const value=parts.length?parts.join('='):args[++i];
  if(value===undefined||value.startsWith('--'))throw new Error('An option value is missing.');
  if(key==='--method')options.method=value;
  if(key==='--split')options.split=value;
  if(key==='--repeat')options.repeat=Number(value);
  if(key==='--approve-usd')options.approveUsd=Number(value);
 }
 if(!['direct','events'].includes(options.method)||!['tuning','heldout','all'].includes(options.split))throw new Error('Invalid method or split.');
 if(!Number.isSafeInteger(options.repeat)||options.repeat<1||options.repeat>10)throw new Error('Repeat must be an integer from 1 to 10.');
 if(options.approveUsd!==null&&(!Number.isFinite(options.approveUsd)||options.approveUsd<=0))throw new Error('Approval must be a positive finite USD cap.');
 return options;
}
export async function prepareCases(cases,options){
 // Research-dataset rows (contract NLI) are not sworn testimony; they can be left out of paid runs.
 const selected=cases.filter(c=>(options.split==='all'||c.split===options.split)&&!(options.skipDatasets&&c.id.startsWith('contractnli-')));
 if(!selected.length)throw new Error('No cases in the selected split.');
 const instructions=options.method==='direct'?await fs.readFile(new URL('../../server/proper_prompts.md',here),'utf8'):null;
 const jobs=[];
 for(const item of selected){
  // Deliberately construct the only detector inputs from testimony, not labels,
  // judicial findings, notes, source names, source URLs, or reference passages.
  if(typeof item.transcript1!=='string'||typeof item.transcript2!=='string')throw new Error('Case lacks testimony inputs.');
  for(let attempt=1;attempt<=options.repeat;attempt++){
   const texts=[item.transcript1,item.transcript2];
   if(options.method==='direct'){
    const plan=buildPlan(texts,[],instructions);
    jobs.push({id:item.id,attempt,texts,plan,instructions,cost:plan.cost,requestCount:plan.requestCount});
   }else{
    const body={workflow:'events-v1',phase:'extract',sameWitnessConfirmed:true,speakerRoles:[{},{}],transcript1:texts[0],transcript2:texts[1]};
    const prepared=await prepareEventWorkflow(body,{maxRequests:512,maxBudgetUsd:100000});
    jobs.push({id:item.id,attempt,body,prepared,cost:prepared.preview.cost,requestCount:prepared.preview.requestCount});
   }
  }
 }
 return {jobs,preview:{mode:'COST PREVIEW ONLY',method:options.method,split:options.split,cases:selected.length,repeat:options.repeat,skipDatasets:options.skipDatasets,
  model:MODEL.id,plannedRequests:jobs.reduce((n,j)=>n+j.requestCount,0),
  phase:options.method==='direct'?'comparison':'extraction only',
  estimatedUsd:money(jobs.reduce((n,j)=>n+j.cost.estimated,0)),
  conservativeBudgetUsd:money(jobs.reduce((n,j)=>n+j.cost.conservativeBudget,0)),
  comparisonRequests:options.method==='events'?'UNKNOWN until validated extraction; no fabricated event counts':undefined,
  completeWorkflowCost:options.method==='events'?'UNKNOWN; extraction estimate excludes comparison':undefined,
  pricing:'Current application-configured uncached USD rates; not verified billing. No automatic retries.',
  answerKeyStatus:'Draft proposals, not approved gold. This runner does not grade or promote them.'}};
}
// Future paid execution is a separately explicit opt-in. Reserve the entire local
// byte-based request ceiling before each call; retain reservation on any error.
// A response that reports usage settles to its measured cost so the cap tracks spend.
const usageUsd=(usage,model)=>usage&&Number.isFinite(usage.input_tokens)&&Number.isFinite(usage.output_tokens)
 ?money(((usage.input_tokens+(usage.cache_creation_input_tokens??0)*1.25+(usage.cache_read_input_tokens??0)*0.1)*model.inputUsdPerMillion+usage.output_tokens*model.outputUsdPerMillion)/1e6):null;
export function cappedTransport(callModel,cap,{model=MODEL}={}){
 let reserved=0,calls=0,capReached=false;
 return {get reservedUsd(){return reserved;},get calls(){return calls;},get capReached(){return capReached;},async call(params,options){
  if(params.model!==model.id)throw Object.assign(new Error('Unpriced model refused.'),{code:'BUDGET_EXHAUSTED'});
  const bytes=Buffer.byteLength(JSON.stringify(params),'utf8');
  const ceiling=money(((bytes+8192)*model.inputUsdPerMillion+params.max_tokens*model.outputUsdPerMillion)/1e6);
  if(!Number.isFinite(ceiling)||reserved+ceiling>cap){capReached=true;throw Object.assign(new Error('Approved spending cap reached; no request started.'),{code:'BUDGET_EXHAUSTED'});}
  reserved=money(reserved+ceiling);calls++;
  // A billing, key or permission refusal will repeat for every case; stop the run instead.
  const message=await callModel(params,{...options,maxRetries:0}).catch(error=>{if([400,401,403].includes(error?.status))capReached=true;throw error;});
  const used=usageUsd(message?.usage,model);
  if(used!==null&&used<ceiling)reserved=money(reserved-ceiling+used);
  return message;
 }};
}
// Labels and scores only; quotes stay in the private audit directory.
const labelsOf=findings=>findings.map(f=>({type:f.type??null,humanConfidence:f.humanConfidence??null,status:f.status??null}));
export async function executeCases(prepared,options,callModel){
 if(options.approveUsd===null)throw new Error('Paid execution refused: --approve-usd=CAP is required.');
 // The transport refuses any request whose ceiling would pass the cap, so the cap only
 // needs to cover the realistic estimate; a run that reaches it stops cleanly.
 if(options.approveUsd<prepared.preview.estimatedUsd)throw new Error('Cap is below the selected phase estimate; no calls started.');
 const transport=cappedTransport(callModel,options.approveUsd),summaries=[];
 for(const job of prepared.jobs){
  if(options.method==='direct'){
   const result=await executePlan({plan:job.plan,texts:job.texts,instructions:job.instructions,callModel:(...args)=>transport.call(...args)});
   summaries.push({id:job.id,attempt:job.attempt,phase:'direct',status:result.analysis.status,findings:result.contradictions.length,labels:labelsOf(result.contradictions)});
   // Incomplete cases are recorded and left ungraded; only an exhausted cap stops the run.
   if(transport.capReached)break;
  }else{
   const reading=await executeEventWorkflow({prepared:job.prepared,body:job.body,callModel:(...args)=>transport.call(...args)});
   summaries.push({id:job.id,attempt:job.attempt,phase:'extraction',status:reading.analysis.status});
   // Never acknowledge gaps automatically. A new explicitly reviewed run is
   // needed for incomplete reading; no retries or relaxed source validation.
   if(reading.analysis.status!=='awaiting_comparison'){if(transport.capReached)break;continue;}
   const body={...job.body,phase:'compare',eventState:reading.analysis.eventState};
   const comparison=await prepareEventWorkflow(body,{maxRequests:512,maxBudgetUsd:100000});
   const remaining=options.approveUsd-transport.reservedUsd;
   if(comparison.preview.cost.estimated>remaining){summaries.push({id:job.id,phase:'comparison',status:'NOT_RUN_CAP',plannedRequests:comparison.preview.requestCount});break;}
   const result=await executeEventWorkflow({prepared:comparison,body,callModel:(...args)=>transport.call(...args)});
   summaries.push({id:job.id,attempt:job.attempt,phase:'comparison',status:result.analysis.status,findings:result.contradictions.length,labels:labelsOf(result.contradictions)});
   if(transport.capReached)break;
  }
 }
 return {summaries,requests:transport.calls,reservedUsd:transport.reservedUsd,note:'Reserved ceiling at local rates, not measured provider spend. No accuracy grading.'};
}
async function main(){
 const options=optionsFor(process.argv.slice(2));
 const cases=JSON.parse(await fs.readFile(new URL('inputs.json',here),'utf8'));
 const prepared=await prepareCases(cases,options);
 console.log(JSON.stringify(prepared.preview,null,2));
 if(options.approveUsd===null)return;
 if(options.approveUsd<prepared.preview.estimatedUsd)throw new Error('Cap below the phase estimate; no paid requests started.');
 // No .env loading and no credential access whatsoever in preview mode.
 if(!process.env.ANTHROPIC_API_KEY)throw new Error('Explicit paid execution requires an exported credential; its value is never printed.');
 const {default:Anthropic}=await import('@anthropic-ai/sdk');
 // Same explicit timeout as server.js; without it the SDK refuses long non-streaming requests locally.
 const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:600000});
 const auditDirectory=await fs.mkdtemp(join(tmpdir(),'deposition-hard-run-'));let responseNumber=0;
 console.log(JSON.stringify({auditDirectory,approvedCapUsd:options.approveUsd,automaticRetries:false}));
 const result=await executeCases(prepared,options,async(params,{signal}={})=>{
  // Error kind and HTTP status only; provider messages may echo submitted testimony.
  const message=await client.messages.create(params,{signal,maxRetries:0}).catch(e=>{console.error(`Request failed: ${e?.constructor?.name??'Error'} status=${e?.status??'none'}`);throw e;});
  await fs.writeFile(join(auditDirectory,`response-${++responseNumber}.json`),JSON.stringify(message),{mode:0o600});
  return message;
 });
 result.auditDirectory=auditDirectory;
 await fs.writeFile(join(auditDirectory,'results.json'),JSON.stringify({options:{...options,approveUsd:options.approveUsd},...result},null,2),{mode:0o600});
 console.log(JSON.stringify(result,null,2));
 console.log(`Grade with: node tests/hard-cases/grade.mjs ${join(auditDirectory,'results.json')}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
 // Provider exceptions may contain submitted data. Do not print them.
 console.error('Hard-case runner stopped. Check arguments, phase budget and prerequisites. No automatic retry.');process.exitCode=1;
});
