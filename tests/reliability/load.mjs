import {performance} from 'node:perf_hooks';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createAdmission,createMeasuredModel,DEFAULT_CONCURRENT_ANALYSES} from '../../server/runtimeControls.js';
import {buildPlan,executePlan} from '../../server/documentAnalysis.js';
export async function mockLoad({waves=5,usersPerWave=20}={}){
 const gate=createAdmission({maxConcurrent:DEFAULT_CONCURRENT_ANALYSES}),rows=[],start=performance.now(),before=process.memoryUsage().rss;
 const texts=['Q: What happened Monday?\nA: I signed the lease.','Q: What happened Monday?\nA: I did not sign the lease.'],plan=buildPlan(texts,[],'synthetic rules');
 let calls=0,peakRss=before;
 const model=createMeasuredModel(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:'{"topicsReviewed":[],"contradictions":[]}'}]};});
 for(let wave=0;wave<waves;wave++)await Promise.all(Array.from({length:usersPerWave},async(_,i)=>{
  const at=performance.now();try{const result=await gate.run(`mock-user-${i}`,()=>executePlan({plan,texts,instructions:'synthetic rules',callModel:model}));rows.push({status:result.analysis.status,durationMs:performance.now()-at});}
  catch(e){rows.push({status:e.status===429?'overload-rejected':'unexpected-error',durationMs:performance.now()-at});}
  peakRss=Math.max(peakRss,process.memoryUsage().rss);
 }));
 const successful=rows.filter(r=>r.status==='complete'),times=successful.map(r=>r.durationMs).sort((a,b)=>a-b),percentile=p=>times[Math.min(times.length-1,Math.floor(times.length*p))]??null;
 return {kind:'MOCK ONLY — not real HTTP, provider speed, throughput or production capacity',usersPerWave,waves,attempts:rows.length,completed:successful.length,rejected:rows.filter(r=>r.status==='overload-rejected').length,unexpectedErrors:rows.filter(r=>r.status==='unexpected-error').length,mockModelCalls:calls,paidCalls:0,p50Ms:percentile(.5),p95Ms:percentile(.95),elapsedMs:performance.now()-start,rssBeforeBytes:before,peakRssBytes:peakRss,allCapacityReleased:gate.active===0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await mockLoad(),directory=new URL('../report/reliability/',import.meta.url);await mkdir(directory,{recursive:true});
 await writeFile(new URL('mock-load.json',directory),JSON.stringify(result,null,2));
 await writeFile(new URL('mock-load.html',directory),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Local mocked load check</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}</style><h1>Local mocked load check</h1><p>${result.kind}. Zero paid calls. Overload rejection is intentional protection, not successful analysis. Run a separate authenticated staging HTTP/load check before making hosting-capacity claims.</p><table>${Object.entries(result).map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></html>`);
 console.table(result);console.log(fileURLToPath(new URL('mock-load.html',directory)));if(result.unexpectedErrors||!result.allCapacityReleased)process.exitCode=1;
}
