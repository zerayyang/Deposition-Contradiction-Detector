import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const url=new URL('../../src/ConfidenceAllowance.jsx',import.meta.url);
const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replaceAll('from "react/jsx-runtime"',`from "${import.meta.resolve('react/jsx-runtime')}"`);
const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const allowance={budgetUsd:25,requiredBudgetUsd:36.88,serverBudgetLimitUsd:25,forecastFindings:27,
  requiresPartialApproval:true,canFitEstimatedFinding:true};
const plan={requestCount:1,documents:[{sections:1},{sections:1}],cost:{estimated:.3,conservativeBudget:.99,note:'Synthetic technical pricing note.'}};
test('short approval summary keeps price and required risk visible with technical details collapsed',()=>{
  const html=renderToStaticMarkup(React.createElement(Component,{allowance,analysisBudget:.99,plan}));
  const visible=html.replace(/<details[\s\S]*?<\/details>/g,'');
  assert.match(visible,/Review allowance/);assert.match(visible,/US \$25.99/);
  assert.match(visible,/Some scores may not finish/);assert.match(visible,/type="checkbox"/);
  assert.match(visible,/Extra double-checks cost more/);
  assert.doesNotMatch(visible,/Forecast|headroom|Server limit|Estimated reserve|Synthetic technical/);
  assert.match(html,/US \$36.88/);assert.match(html,/Synthetic technical pricing note/);
  assert.doesNotMatch(html,/<details[^>]*\bopen/);
});
test('insufficient allowance remains prominently blocked and disclosure preserves extra-cost notice',()=>{
  const html=renderToStaticMarkup(React.createElement(Component,{allowance:{...allowance,canFitEstimatedFinding:false},analysisBudget:1}));
  assert.match(html,/role="alert"/);assert.match(html,/too low to start score checks/);
  assert.doesNotMatch(html,/type="checkbox"/);
  assert.match(html,/borderline double-check costs extra/);
});
