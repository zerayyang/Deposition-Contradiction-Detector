import {readApiJson,apiFailureMessage} from './apiResponse.js';
import {DOCUMENT_LIMITS,utf8Bytes} from '../../shared/documentLimits.js';
export function analysisBody(texts,documents) {
  const body={transcript1:texts[0],transcript2:texts[1],documents:documents.map(f=>f?{extraction:f.extraction??null,pageMappingStale:Boolean(f.pageMappingStale)}:null)};
  if(utf8Bytes(JSON.stringify(body))>DOCUMENT_LIMITS.requestBytes-4096)throw new Error('The encoded request exceeds 160 MiB. No text was truncated.');
  return body;
}
export async function previewAnalysis(body,{signal,fetchImpl=fetch}={}) {
  const response=await fetchImpl('/api/analysis/plan',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return readApiJson(response,'Could not prepare the analysis plan. The analysis service may be unavailable.');
}
export async function runAnalysis(body,plan,{signal,onEvent=()=>{},fetchImpl=fetch}={}) {
  const response=await fetchImpl('/api/analyze/stream',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,approvedPlanId:plan.id})});
  if(!response.ok)await readApiJson(response,'Analysis failed to start.');
  if(response.headers?.get('content-type')?.includes('text/html'))throw new Error(apiFailureMessage(502));
  if(!response.body)throw new Error('Streaming is unavailable in this browser.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
  const abort=()=>{void reader.cancel();};signal?.addEventListener('abort',abort,{once:true});
  try{
    for(;;){signal?.throwIfAborted();const {value,done}=await reader.read();buffer+=decoder.decode(value??new Uint8Array(),{stream:!done});
      let at;while((at=buffer.indexOf('\n'))>=0){signal?.throwIfAborted();const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{throw new Error('Analysis returned unreadable results. Any received checkpoints are partial; review saved results before starting another paid run.');}if(event.event==='error')throw new Error(event.error);await onEvent(event);if(event.event==='result')result=event;}
      signal?.throwIfAborted();if(done)break;
    }
    if(buffer.trim()||!result)throw new Error('Connection ended before the final result. Retained checkpoints are partial, not complete.');
    return result;
  }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
