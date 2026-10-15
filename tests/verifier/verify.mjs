import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { validateGold, checkResponse, isLabelError, validAttempt, checkOrdinal } from './checks.mjs';
import { writeReports, printSummary } from './report.mjs';

export async function runVerifier({rows,fetchImpl=globalThis.fetch,url='http://localhost:3000/api/analyze',runs=3,timeoutMs=120000,ids=null,invariants=null,onProgress=()=>{}}={}) {
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('runs and timeoutMs must be positive integers');
  const validated = validateGold(rows);
  const errors = [...validated.errors];
  if (ids && (new Set(ids).size !== ids.length || !ids.length)) errors.push('Invalid --ids: empty or duplicate selection');
  if (ids) for (const id of ids) if (!validated.approved.some(r=>r.id===id)) errors.push(`Requested ID is missing or not approved: ${id}`);
  const selected = validated.approved.filter(r=>!ids || ids.includes(r.id));
  if (!selected.length) errors.push('EMPTY_SELECTION_FAIL: no approved cases selected');
  const result = {createdAt:new Date().toISOString(),url,temperature:{available:false,reason:'Application API does not expose temperature; server setting unmodified'},selection:{total:Array.isArray(rows)?rows.length:0,approved:validated.approved.length,selected:selected.length,excludedApproved:validated.approved.length-selected.length,requestedIds:ids,runsPerCase:runs},errors,rejected:validated.rejected,invariants:invariants??{pass:false,output:'Invariants not supplied'},cases:[]};
  // Malformed gold never starts requests. Availability errors never earn case grades.
  requests: if (!errors.length) for (const row of selected) {
    const caseRuns=[];
    for(let run=1;run<=runs;run++) {
      onProgress(`${row.id}: starting attempt ${run}/${runs}`);
      const started=performance.now();
      const entry={run,request:{transcript1:row.transcript1_text,transcript2:row.transcript2_text},latencyMs:0,httpStatus:null,rawText:null,rawResponse:null,errors:[],candidates:[],requestSucceeded:false,connectionRefused:false,pass:null};
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(new Error(`Request timeout after ${timeoutMs} ms`)),timeoutMs);
      try {
        const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(entry.request),signal:controller.signal});
        entry.httpStatus=response.status;
        entry.rawText=await response.text();
        entry.requestSucceeded=response.ok;
        try { entry.rawResponse=JSON.parse(entry.rawText); } catch { entry.errors.push('Response is not valid JSON'); }
        if(!response.ok) entry.errors.push(`HTTP ${response.status}: ${entry.rawResponse?.error??entry.rawText}`);
        if(response.ok && entry.errors.length===0) Object.assign(entry,checkResponse(entry.rawResponse,row));
      } catch(e) {entry.errors.push(`Request failed: ${e.name}: ${e.message}`);
        const refused = error => error && (error.code === 'ECONNREFUSED' || /connection refused|ECONNREFUSED/i.test(error.message ?? '') || refused(error.cause) || error.errors?.some(refused));
        entry.connectionRefused=Boolean(refused(e));
      }
      finally { clearTimeout(timer); entry.latencyMs=Math.round(performance.now()-started); }
      entry.pass=entry.requestSucceeded ? entry.errors.length===0 : null;
      caseRuns.push(entry);
      onProgress(`${row.id}: attempt ${run}/${runs} ${entry.pass===null?'REQUEST ERROR':entry.pass?'PASS':'FAIL'} in ${entry.latencyMs} ms${entry.errors.length?': '+entry.errors.join('; '):''}`);
      if (entry.connectionRefused) {
        result.cases.push({row,runs:caseRuns,pass:null,stable:null,typeStable:null,bandStable:null,humanRecheck:false});
        break requests;
      }
    }
    const labelFor=(r,key)=>r.notFlagged?'NOT_FLAGGED':r.candidates[0]?.candidate?.[key];
    const stableFor = key => caseRuns.length===runs && caseRuns.every(r=>r.notFlagged&&r.pass||validAttempt(r)) && caseRuns.every(r => labelFor(r,key) === labelFor(caseRuns[0],key));
    const typeStable = stableFor('type'), bandStable = caseRuns.some(r=>r.notFlagged)?null:stableFor('band');
    const actualLabels=caseRuns.map(r=>r.candidates.length===1?JSON.stringify([r.candidates[0].candidate?.type,r.candidates[0].candidate?.status]):null);
    const humanRecheck=runs===3&&typeStable&&actualLabels.every(s=>s===actualLabels[0])&&caseRuns.every(r=>!r.notFlagged&&validAttempt(r)&&!r.candidates[0].labelMatch&&r.errors.length>0&&r.errors.every(isLabelError));
    result.cases.push({row,runs:caseRuns,outcome:caseRuns.some(r=>r.partialTargetReview)?'PARTIAL_TARGET_REVIEW':caseRuns.some(r=>r.targetNotMatched)?'TARGET_NOT_MATCHED':caseRuns.every(r=>r.notFlagged)?'NOT_FLAGGED':caseRuns.some(r=>r.failureCategory==='classification')?'CLASSIFICATION_FAILURE':null,stable:typeStable,typeStable,bandStable,bandStabilityInformational:true,ordinalErrors:[],humanRecheck,reviewMessage:humanRecheck?'verifier disagrees in 3/3 runs, human should recheck the required label':null,pass:caseRuns.some(r=>!r.requestSucceeded)?null:typeStable&&caseRuns.every(r=>r.pass)});
  }
  const allAttempts=result.cases.flatMap(c=>c.runs);
  const requestFailures=allAttempts.filter(r=>!r.requestSucceeded).length;
  const successfulRequests=allAttempts.length-requestFailures;
  result.availability={attemptedRequests:allAttempts.length,successfulRequests,failedRequests:requestFailures,unattemptedRequests:selected.length*runs-allAttempts.length};
  if (allAttempts.some(r=>r.connectionRefused) || (allAttempts.length>0 && successfulRequests*2<allAttempts.length)) {
    result.status='NOT_RUN';
    result.notRunMessage=`NOT RUN: server unreachable (${requestFailures}/${allAttempts.length} requests failed). No accuracy results.`;
    result.pass=null;
    for(const c of result.cases) {
      Object.assign(c,{pass:null,stable:null,typeStable:null,bandStable:null,humanRecheck:false,reviewMessage:null,ordinalErrors:[]});
      for(const r of c.runs) r.pass=null;
    }
    result.ordinal={status:'SKIPPED',pass:null,reason:'Server unreachable; no score evaluation'};
    result.summary={attemptedRuns:allAttempts.length,plannedRuns:selected.length*runs,successfulRequests,requestFailures,
      passedAttempts:null,failedAttempts:null,passedCases:null,typeCorrect:null,evidenceCorrect:null,bandCorrect:null,
      accuracyPercent:null,typeAccuracyPercent:null,evidenceAccuracyPercent:null,bandAccuracyPercent:null,stabilityPercent:null};
    return result;
  }
  result.status='COMPLETED';
  result.ordinal=checkOrdinal(result.cases);
  const attemptedRuns=result.cases.reduce((n,c)=>n+c.runs.length,0),passedAttempts=result.cases.reduce((n,c)=>n+c.runs.filter(r=>r.pass).length,0);
  const evaluatedRuns=successfulRequests;
  const notFlaggedAttempts=allAttempts.filter(r=>r.requestSucceeded&&r.notFlagged).length;
  const targetNotMatchedAttempts=allAttempts.filter(r=>r.requestSucceeded&&r.targetNotMatched).length;
  const partialTargetReviewAttempts=allAttempts.filter(r=>r.requestSucceeded&&r.partialTargetReview).length;
  const classificationEvaluatedRuns=evaluatedRuns-notFlaggedAttempts-targetNotMatchedAttempts;
  const classificationFailedAttempts=allAttempts.filter(r=>r.requestSucceeded&&r.failureCategory==='classification').length;
  const pct=n=>evaluatedRuns?Math.round(10000*n/evaluatedRuns)/100:null;
  const classificationPct=n=>classificationEvaluatedRuns?Math.round(10000*n/classificationEvaluatedRuns)/100:null;
  let typeCorrect=0,evidenceCorrect=0,bandCorrect=0;
  const evidenceCheckedAttempts=result.cases.reduce((n,c)=>n+(c.row.review_policy?.evidence_assertion==='informational'?0:c.runs.filter(r=>r.requestSucceeded&&!r.notFlagged&&!r.targetNotMatched).length),0);
  for(const c of result.cases)for(const r of c.runs)if(validAttempt(r)){
    const checked=r.candidates[0];
    typeCorrect+=Number(checked.typeMatch);
    evidenceCorrect+=Number(checked.evidenceChecked&&checked.evidenceMatch);
    bandCorrect+=Number(checked.bandMatch);
  }
  const stableCases=result.cases.filter(c=>c.pass!==null&&c.stable).length;
  result.summary={notFlaggedAttempts,targetNotMatchedAttempts,partialTargetReviewAttempts,classificationFailedAttempts,classificationEvaluatedRuns,attemptedRuns,plannedRuns:selected.length*runs,passedAttempts,failedAttempts:result.cases.reduce((n,c)=>n+c.runs.filter(r=>r.pass===false).length,0),evaluatedRuns,requestFailures,successfulRequests,accuracyPercent:pct(passedAttempts),typeCorrect,typeAccuracyPercent:classificationPct(typeCorrect),evidenceCorrect,evidenceCheckedAttempts,evidenceUncheckedAttempts:classificationEvaluatedRuns-evidenceCheckedAttempts,evidenceAccuracyPercent:evidenceCheckedAttempts?Math.round(10000*evidenceCorrect/evidenceCheckedAttempts)/100:null,bandCorrect,bandAccuracyInformational:true,bandStableCases:result.cases.filter(c=>c.bandStable).length,bandAccuracyPercent:classificationPct(bandCorrect),stableCases,stabilityPercent:result.cases.filter(c=>c.pass!==null).length?Math.round(10000*stableCases/result.cases.filter(c=>c.pass!==null).length)/100:null,passedCases:result.cases.filter(c=>c.pass).length};
  result.pass=!errors.length&&result.invariants.pass&&attemptedRuns>0&&result.ordinal.failed===0&&result.cases.every(c=>c.pass);
  return result;
}
export function runInvariants() {
  const env={...process.env,NO_COLOR:'1'};
  delete env.FORCE_COLOR;
  const run=spawnSync(process.execPath,['--test',fileURLToPath(new URL('./invariants.test.mjs',import.meta.url))],{encoding:'utf8',timeout:60000,env});
  return {pass:run.status===0,exitCode:run.status,output:(run.stdout??'')+(run.stderr??''),error:run.error?.message??null};
}
async function main() {
  if(process.argv.includes('--help')) {console.log('Usage: node tests/verifier/verify.mjs [--report DIR] [--runs N] [--timeout-ms N] [--ids ID,ID] [--url URL]\nReads ONLY tests/gold.json. Default: 3 sequential attempts per approved case, 120000 ms per attempt, http://localhost:3000/api/analyze. Writes latest HTML/JSON plus immutable timestamped raw-result archive. Discrepancies exit 1.');return;}
  const options={gold:fileURLToPath(new URL('../gold.json',import.meta.url)),report:fileURLToPath(new URL('../report/',import.meta.url)),runs:3,timeoutMs:120000,ids:null,url:'http://localhost:3000/api/analyze'};
  let cliError=null;
  try {for(let i=2;i<process.argv.length;i++){const arg=process.argv[i],value=process.argv[++i];if(!['--report','--runs','--timeout-ms','--ids','--url'].includes(arg)||value===undefined)throw new Error(`Unknown or incomplete argument ${arg}`);if(arg==='--runs')options.runs=Number(value);else if(arg==='--timeout-ms')options.timeoutMs=Number(value);else if(arg==='--ids')options.ids=value.split(',');else options[arg.slice(2)]=value;}} catch(e){cliError=e.message;}
  let rows=[],readError;
  if(!cliError) try {rows=JSON.parse(await readFile(options.gold,'utf8'));}catch(e){readError=`Cannot read gold: ${e.message}`;}
  let result;
  try {result=await runVerifier({...options,rows,invariants:runInvariants(),onProgress:message=>console.log(message)});}catch(e){cliError=e.message;result=await runVerifier({rows:[],invariants:runInvariants()});}
  if(cliError||readError){result.errors.push(...[cliError,readError].filter(Boolean));result.pass=false;}
  await writeReports(result,resolve(options.report));
  printSummary(result);
  console.log(`Reports: ${resolve(options.report,'report.html')} and results.json`);
  process.exitCode=result.pass?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
