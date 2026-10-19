import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=new URL('../../src/AnalysisStatus.jsx',import.meta.url);
const {code}=await transformWithOxc(await readFile(source,'utf8'),'AnalysisStatus.jsx',{jsx:{runtime:'automatic'}});
const resolved=code.replace(/from ["']([^"']+)["']/g,(_all,dependency)=>'from '+JSON.stringify(dependency.startsWith('.')?new URL(dependency,source).href:import.meta.resolve(dependency)));
const Component=(await import('data:text/javascript;base64,'+Buffer.from(resolved).toString('base64'))).default;
test('rendered mixed outcome shows partial counts and actionable failure without raw response JSON',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'partial',planned:3,completed:1,partial:1,failed:1,tasks:[{id:'1',a:0,b:1,status:'partial',acceptedFindings:2,rejectedFindings:[{candidateIndex:2,reason:'A returned quotation is outside its submitted section.'}],rawText:'DO_NOT_DISPLAY_RAW_MODEL_JSON'},{id:'2',a:0,b:2,status:'failed',stopReason:'max_tokens'}]},active:false,elapsed:80}));
 assert.match(html,/Review partly complete/);assert.match(html,/partly completed/);assert.match(html,/2 findings retained; 1 rejected/);assert.match(html,/output limit/);assert.doesNotMatch(html,/DO_NOT_DISPLAY_RAW_MODEL_JSON|remaining/);
});
test('running view waits for timing and unverified-source review stays visible',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'running',planned:2,completed:0,issues:[{pairId:'0:0',reason:'unverified'}]},active:true,elapsed:10}));
 assert.match(html,/Waiting for the first comparison/);assert.match(html,/findings need source review/);
});
test('active first request shows animated activity without a fabricated completion value',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'running',planned:1,completed:0},active:true,elapsed:15}));
 assert.match(html,/In Progress/);assert.match(html,/analysis-progress-dots/);assert.match(html,/analysis-progress-activity/);
 const progress=html.match(/<progress[^>]*>/)?.[0];assert.ok(progress);assert.doesNotMatch(progress,/value=/);
 assert.doesNotMatch(html,/An estimate appears after|Results will appear as comparisons finish/);
});
test('measured completion drives the bar and stopped reviews do not animate',()=>{
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'running',planned:2,completed:1},active:true,elapsed:30}));
 assert.match(html,/<progress[^>]*value="1"[^>]*max="2"/);assert.doesNotMatch(html,/analysis-progress-activity/);
 const stopped=renderToStaticMarkup(createElement(Component,{analysis:{status:'complete',planned:2,completed:2},active:false,elapsed:45}));
 assert.doesNotMatch(stopped,/analysis-progress-dots|analysis-progress-activity/);assert.match(stopped,/<progress[^>]*value="2"[^>]*max="2"/);
});

test('scoring bar tracks confidence checks instead of a finished comparison and keeps gaps visible',()=>{
 const findings=Array.from({length:8},(_,i)=>({type:'DIRECT',hybridConfidence:{status:i<3?'EXPERIMENTAL':'PENDING',completedSteps:i<3?7:0}}));
 const html=renderToStaticMarkup(createElement(Component,{analysis:{status:'partial',planned:1,completed:0,partial:1},active:true,phase:'scoring',findings,elapsed:208}));
 assert.match(html,/Checking confidence/);assert.match(html,/21 of 56 checks finished/);
 assert.match(html,/<progress[^>]*value="37"[^>]*max="100"/);
 assert.match(html,/Analysis retained partial results/);
 assert.doesNotMatch(html,/1 of 1 comparisons finished/);
});
