import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {reviewStages} from '../../src/lib/reviewProgress.js';
import {renderToStaticMarkup} from 'react-dom/server';

const url=new URL('../../src/ReviewProgress.jsx',import.meta.url);
const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replaceAll('./lib/reviewProgress.js',new URL('../../src/lib/reviewProgress.js',import.meta.url).href).replaceAll('from "react/jsx-runtime"',`from "${import.meta.resolve('react/jsx-runtime')}"`);
const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('three stage rings animate unknown progress without inventing percentages',()=>{
  const stages=reviewStages({status:'running'},[],'analysis');
  assert.deepEqual(stages.map(s=>s.percent),[null,null,null]);
  assert.deepEqual(stages.map(s=>s.spinning),[true,true,false]);
  const html=renderToStaticMarkup(React.createElement(Component,{analysis:{status:'running'},findings:[],phase:'analysis'}));
  assert.equal((html.match(/role="progressbar"/g)??[]).length,3);
  assert.doesNotMatch(html,/aria-valuenow/);
});
test('each transcript uses its own verified coverage, not the other document percentage',()=>{
  const stages=reviewStages({status:'partial',coverage:[
    {document:1,sections:[{status:'complete'},{status:'pending'}]},
    {document:2,pages:[{analysisStatus:'complete'},{analysisStatus:'complete'},{analysisStatus:'pending'},{analysisStatus:'failed'}]},
  ]},[],'analysis');
  assert.deepEqual(stages.slice(0,2).map(s=>s.percent),[50,50]);
  assert.match(stages[0].detail,/1 of 2 sections/);assert.match(stages[1].detail,/2 of 4 pages/);
});
test('scoring counts saved completed checks, completed analyses fill transcript rings',()=>{
  const stages=reviewStages({status:'complete'},[
    {type:'DIRECT',hybridConfidence:{completedSteps:7,status:'EXPERIMENTAL'}},
    {type:'INFERENTIAL',hybridConfidence:{completedSteps:0,status:'PENDING'}},
    {type:'NEEDS_REVIEW'},
  ],'scoring');
  assert.deepEqual(stages.map(s=>s.percent),[100,100,50]);
  assert.equal(stages[2].detail,'7 of 14 checks finished');
  assert.equal(stages[0].spinning,false);
});
test('partial analysis never gets fabricated full transcript completion during scoring',()=>{
  const stages=reviewStages({status:'partial'},[],'scoring');
  assert.equal(stages[0].percent,null);assert.equal(stages[0].detail,'Partial coverage retained');
  assert.equal(stages[2].percent,null);
});
