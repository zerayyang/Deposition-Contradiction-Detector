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

// Hosted runs save a partial result after each step. Fictional counts only.
const analysis={status:'partial',planned:2,completed:1,tasks:[{id:'0:0',status:'completed',acceptedFindings:3},{id:'1:0',status:'pending'}]};
test('a partial step during an active run shows progress, not "partly complete"',()=>{
  const html=renderToStaticMarkup(createElement(Component,{analysis,active:true,elapsed:30}));
  assert.match(html,/Reviewing your documents/);assert.doesNotMatch(html,/Review partly complete/);
});
test('a partial result after the run has stopped still says partly complete',()=>{
  const html=renderToStaticMarkup(createElement(Component,{analysis,active:false}));
  assert.match(html,/Review partly complete/);
});
