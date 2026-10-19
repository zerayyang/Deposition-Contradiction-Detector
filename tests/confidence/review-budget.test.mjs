import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const url=new URL('../../src/ReviewBudget.jsx',import.meta.url);
const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
let code=transformed.code;
for(const name of ['react','react/jsx-runtime']) code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
code=code.replaceAll('./lib/reviewBudget.js',new URL('../../src/lib/reviewBudget.js',import.meta.url).href);
const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const plan={cost:{conservativeBudget:.988328},approvedBudgetUsd:.99,serverBudgetLimitUsd:25};
test('collapsed budget shows rounded suggestion and exposes accessible explicit preset actions',()=>{
  const props={plan,onChange:()=>{}};
  const tree=Component(props),html=renderToStaticMarkup(tree);
  assert.match(html,/US \$0.99/);assert.doesNotMatch(html,/0.988328|type="number"|<details[^>]* open/);
  assert.match(html,/Adjust limit/);assert.match(html,/May stop early/);assert.match(html,/cannot guarantee completion/);
  const changes=[];
  const interactive=Component({...props,onChange:value=>changes.push(value)});
  const details=interactive.props.children[1];
  const buttons=details.props.children[1].props.children;
  for(const button of buttons) button.props.onClick();
  assert.deepEqual(changes,[.74,.99,1.49]);
});
test('fixed recovery has no adjustment action; server-limited plans warn and disable extra room',()=>{
  const fixed=renderToStaticMarkup(React.createElement(Component,{plan:{...plan,budgetFixed:true},onChange:()=>{throw Error('fixed');}}));
  assert.match(fixed,/Saved limit/);assert.doesNotMatch(fixed,/<button|<details/);
  const limited=renderToStaticMarkup(React.createElement(Component,{plan:{...plan,serverBudgetLimitUsd:.8,approvedBudgetUsd:.8}}));
  assert.match(limited,/below the full analysis allowance/);assert.match(limited,/disabled=""/);
});
