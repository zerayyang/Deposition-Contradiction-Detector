// Server speed check: times real HTTP requests. Never calls the AI and costs nothing.
//   node tests/reliability/speed.mjs                     local server (http://127.0.0.1:3000)
//   node tests/reliability/speed.mjs https://your-site   a deployed site (health check only, gentle)
// 1. Health: many small requests at once (how fast the server answers, and how many per second).
// 2. Plan (local only): the server reads two transcripts and plans the analysis, the real
//    work done before any AI call. Kept under the 30-per-minute limit per user.
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

const ms=n=>Math.round(n*10)/10;
function summary(name,times,failures,elapsed){
  const sorted=[...times].sort((a,b)=>a-b),at=p=>sorted.length?ms(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]):null;
  return {test:name,requests:times.length+failures.length,ok:times.length,failed:failures.length,
    failures:[...new Set(failures)].join(', ')||'none',p50Ms:at(0.5),p95Ms:at(0.95),maxMs:at(1),perSecond:elapsed?Math.round(times.length/(elapsed/1000)):null};
}
async function timed(url,options){const start=performance.now();const res=await fetch(url,options);await res.arrayBuffer();return {status:res.status,ms:performance.now()-start};}
async function burst(name,count,concurrency,makeRequest){
  const times=[],failures=[];let next=0;const start=performance.now();
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(next<count){next++;
      try{const r=await makeRequest();if(r.status>=200&&r.status<300)times.push(r.ms);else failures.push(`HTTP ${r.status}`);}
      catch(e){failures.push(e?.cause?.code??e?.name??'network error');}
    }
  }));
  return summary(name,times,failures,performance.now()-start);
}
// Fictional testimony, about two pages each, so planning does real work.
const page=(day,answer)=>Array.from({length:40},(_,i)=>`Q. On ${day}, what happened at step ${i+1}?\nA. ${answer} ${i+1}.`).join('\n');
const body=JSON.stringify({transcript1:page('Monday','I was at the office for item'),transcript2:page('Monday','I was at home for item'),documents:[null,null]});

export async function speedTest(base='http://127.0.0.1:3000',{healthRequests,concurrency}={}){
  const remote=!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base);
  healthRequests??=remote?60:300;concurrency??=remote?4:20;
  const results=[await burst('Health check',healthRequests,concurrency,()=>timed(`${base}/api/health`))];
  if(!remote)results.push(await burst('Plan an analysis (no AI)',20,1,()=>timed(`${base}/api/analysis/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body})));
  return {server:base,results,note:remote?'Deployed site: health only (planning needs sign-in). Times include your internet connection.':'Local server. Times exclude the AI, which takes about 1–2 minutes per analysis.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const r=await speedTest(process.argv[2]);
  console.log(`Server: ${r.server}`);console.table(r.results);console.log(r.note);
  if(r.results.some(x=>x.failed))process.exitCode=1;
}
