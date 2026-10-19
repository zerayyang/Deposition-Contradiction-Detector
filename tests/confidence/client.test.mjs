import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

async function component() {
  const url=new URL('../../src/HybridConfidence.jsx',import.meta.url);
  const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
  let code=transformed.code;
  for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`).replaceAll(`from '${name}'`,`from '${import.meta.resolve(name)}'`);
  code=code.replaceAll('../shared/hybridConfidence.js',new URL('../../shared/hybridConfidence.js',import.meta.url).href);
  return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
test('finding panel has no separate paid action and renders its summary without calls',async()=>{
  const Component=await component();let calls=0;
  const html=renderToStaticMarkup(React.createElement(Component,{result:{type:'DIRECT'},apiFetch:async()=>{calls++;}}));
  assert.match(html,/AI agreement/);assert.match(html,/Not checked/);assert.doesNotMatch(html,/<button/);
  assert.doesNotMatch(html,/Approve cost and check/);assert.equal(calls,0);
});
test('completed uncalibrated panel shows actual votes and spending without an accuracy claim',async()=>{
  const Component=await component();
  const html=renderToStaticMarkup(React.createElement(Component,{result:{type:'DIRECT',hybridConfidence:{status:'UNCALIBRATED',originalType:'DIRECT',agreeingVotes:5,expectedVotes:6,spentUsd:.06}}}));
  assert.match(html,/5 of 6/);assert.match(html,/0.0600/);assert.match(html,/not measured accuracy/);
});
