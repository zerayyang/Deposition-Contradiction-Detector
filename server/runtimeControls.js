import {performance} from 'node:perf_hooks';
// Heavy requests the server runs at the same time. Analysis remains one per
// user; the confidence step route may explicitly admit a two-request lane.
export const DEFAULT_CONCURRENT_ANALYSES=4;
export function createAdmission({maxConcurrent=1}={}) {
 let active=0;const owners=new Map();
 return {get active(){return active;},async run(owner,work,{ownerLimit=1}={}){
  const existing=owners.get(owner);
  if(active>=maxConcurrent||!Number.isInteger(ownerLimit)||ownerLimit<1||existing&&(existing.limit!==ownerLimit||existing.count>=ownerLimit)){const e=new Error('An analysis is already running. Wait for it to finish or cancel it.');e.status=429;throw e;}
  active++;const entry=existing??{count:0,limit:ownerLimit};entry.count++;owners.set(owner,entry);
  try{return await work();}finally{active--;entry.count--;if(!entry.count)owners.delete(owner);}
 }};
}
export function createRateLimit({limit=30,windowMs=60000,now=Date.now}={}){
 const buckets=new Map();
 return owner=>{const time=now();let bucket=buckets.get(owner);if(!bucket||bucket.until<=time){bucket={count:0,until:time+windowMs};buckets.set(owner,bucket);}
  if(++bucket.count>limit)return false;
  if(buckets.size>1000)for(const [key,value]of buckets)if(value.until<=time)buckets.delete(key);
  return true;
 };
}
export function createMeasuredModel(callModel,{timeoutMs=600000,log=()=>{}}={}) {
 return async(params,options={})=>{
  const start=performance.now(),timeout=AbortSignal.timeout(timeoutMs),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(signal.reason);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  const {auditRunId,...providerOptions}=options;
  try{const response=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return callModel(params,{...providerOptions,signal});}),stopped]);log({event:'model_request_finished',runId:auditRunId??null,durationMs:Math.round(performance.now()-start),stopReason:response.stop_reason??null,inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null});return response;}
  catch(error){log({event:'model_request_failed',runId:auditRunId??null,durationMs:Math.round(performance.now()-start),category:timeout.aborted?'TIMEOUT':options.signal?.aborted?'CANCELLED':'PROVIDER_ERROR'});throw error;}finally{signal.removeEventListener('abort',abort);}
 };
}
