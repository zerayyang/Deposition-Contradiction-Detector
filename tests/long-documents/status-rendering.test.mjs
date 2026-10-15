import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {transformWithOxc} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=new URL('../../src/AnalysisStatus.jsx',import.meta.url);
const temporary=new URL(`../../src/.analysis-status-${randomUUID()}.mjs`,import.meta.url);
let Component;
try{
 const {code}=await transformWithOxc(await readFile(source,'utf8'),'AnalysisStatus.jsx',{jsx:{runtime:'automatic'}});
 await writeFile(temporary,code);Component=(await import(temporary.href)).default;
}finally{await unlink(temporary).catch(()=>{});}
test('rendered mixed outcome shows partial counts and actionable failure without raw response JSON',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'partial',planned:3,completed:1,partial:1,failed:1,tasks:[{id:'1',a:0,b:1,status:'partial',acceptedFindings:2,rejectedFindings:[{candidateIndex:2,reason:'A returned quotation is outside its submitted section.'}],rawText:'DO_NOT_DISPLAY_RAW_MODEL_JSON'},{id:'2',a:0,b:2,status:'failed',stopReason:'max_tokens'}]},active:false,elapsed:80}));
 assert.match(html,/Review partly complete/);assert.match(html,/partly completed/);assert.match(html,/2 findings retained; 1 rejected/);assert.match(html,/output limit/);assert.doesNotMatch(html,/DO_NOT_DISPLAY_RAW_MODEL_JSON|remaining/);
});
test('running view waits for timing and unverified-source review stays visible',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'running',planned:2,completed:0,issues:[{pairId:'0:0',reason:'unverified'}]},active:true,elapsed:10}));
 assert.match(html,/Calculating time remaining/);assert.match(html,/findings need source review/);
});
