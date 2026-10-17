import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {optionsFor} from '../hard-cases/run.mjs';
const exec=promisify(execFile),run=resolve('tests/hard-cases/run.mjs'),grade=resolve('tests/hard-cases/grade.mjs');
test('corpus selection preserves default options and accepts both CLI forms',()=>{
 assert.ok(!Object.hasOwn(optionsFor([]),'corpus'));
 assert.equal(optionsFor(['--corpus','synthetic path']).corpus,resolve('synthetic path'));
 assert.equal(optionsFor(['--corpus=synthetic path']).corpus,resolve('synthetic path'));
 for(const args of [['--corpus'],['--corpus='],['--corpus','--method']])assert.throws(()=>optionsFor(args));
});
test('custom corpus preview reads only the selected synthetic inputs',async()=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'fresh-corpus-options-'));
 try{
  await fs.writeFile(join(dir,'inputs.json'),JSON.stringify([{id:'synthetic-option-test',split:'heldout',transcript1:'Q: What did you sign?\nA: A fictional form.',transcript2:'Q: What did you sign?\nA: A fictional notice.'}]));
  await fs.writeFile(join(dir,'reference-findings.json'),'THIS_REFERENCE_MUST_NOT_BE_READ');
  const {stdout}=await exec(process.execPath,[run,'--method','events','--corpus',dir]);
  const preview=JSON.parse(stdout);assert.equal(preview.cases,1);assert.equal(preview.plannedRequests,2);assert.equal(preview.mode,'COST PREVIEW ONLY');
  assert.ok(!stdout.includes('synthetic-option-test'));assert.ok(!stdout.includes('THIS_REFERENCE_MUST_NOT_BE_READ'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('grader optional reference path selects only the provided synthetic answer key',async()=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'fresh-grade-options-'));
 try{
  const result=join(dir,'results.json'),ref=join(dir,'references.json');
  await fs.writeFile(result,JSON.stringify({summaries:[{id:'synthetic-option-test',attempt:1,phase:'comparison',status:'complete',labels:[{type:'DIRECT'}]}]}));
  await fs.writeFile(ref,JSON.stringify([{id:'synthetic-option-test',label:'DIRECT'}]));
  const {stdout}=await exec(process.execPath,[grade,result,ref]);const parsed=JSON.parse(stdout);
  assert.equal(parsed.summary.graded,1);assert.equal(parsed.summary.correct,1);
  const baseline=JSON.parse((await exec(process.execPath,[grade,result])).stdout);assert.equal(baseline.summary.graded,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
