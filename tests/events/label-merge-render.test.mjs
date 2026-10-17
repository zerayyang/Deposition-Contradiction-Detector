import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=new URL('../../src/ReviewCard.jsx',import.meta.url);
const {code}=await transformWithOxc(await readFile(source,'utf8'),'ReviewCard.jsx',{jsx:{runtime:'automatic'}});
const resolved=code.replace(/from ["']([^"']+)["']/g,(_all,dependency)=>'from '+JSON.stringify(dependency.startsWith('.')?new URL(dependency,source).href:import.meta.resolve(dependency)));
const {ReviewCard}=await import('data:text/javascript;base64,'+Buffer.from(resolved).toString('base64'));

// Fictional card only.
test('a merged card shows "Labels disagree", every view, and no score',()=>{
  const result={type:'DIRECT',labelDisagreement:true,status:'NOT_EVALUABLE',notEvaluableReason:'LABEL_DISAGREEMENT',flag:'REVIEW',humanConfidence:null,reasoning:'Scripted.',
    claim1:{original:'I signed the lease.'},claim2:{original:'I never signed the lease.'},
    mergedViews:[{id:'a',type:'DIRECT',issue:'Signing the lease',reasoning:'Opposite answers.'},{id:'b',type:'FALSE_POSITIVE',issue:'Who signed',reasoning:'Different scope.'}]};
  const html=renderToStaticMarkup(createElement(ReviewCard,{result}));
  assert.match(html,/Labels disagree/);assert.match(html,/Signing the lease/);assert.match(html,/Who signed/);
  assert.match(html,/False positive:/);assert.match(html,/Direct:/);
  assert.match(html,/A person should decide before any score is shown/);assert.match(html,/Not evaluable/);
});

test('an ordinary card still shows its own label',()=>{
  const html=renderToStaticMarkup(createElement(ReviewCard,{result:{type:'INFERENTIAL',status:'NOT_EVALUABLE',notEvaluableReason:'NO_FACTS',reasoning:'Scripted.',claim1:{original:'a'},claim2:{original:'b'}}}));
  assert.match(html,/Inferential/);assert.doesNotMatch(html,/Labels disagree/);
});
