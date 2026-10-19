import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {confidenceLabel} from '../../shared/hybridConfidence.js';

test('confidence label boundaries explain support without altering scores or overriding dissent',()=>{
  for(const [score,label] of [[13,'Low confidence'],[49,'Low confidence'],[50,'Not sure'],[74,'Not sure'],[75,'Confident'],[89,'Confident'],[90,'Very confident'],[100,'Very confident']])assert.equal(confidenceLabel(score),label);
  assert.equal(confidenceLabel(95,{reviewerAgrees:false}),'Not sure');
  for(const score of [null,undefined,NaN,-1,101])assert.equal(confidenceLabel(score),null);
});
test('finding ring shows readable state, original percentage and uncalibrated context',async()=>{
  const url=new URL('../../src/HybridConfidence.jsx',import.meta.url);
  const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
  let code=transformed.code;
  for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
  code=code.replaceAll('./lib/reviewerPoints.js',new URL('../../src/lib/reviewerPoints.js',import.meta.url).href)
    .replaceAll('../shared/hybridConfidence.js',new URL('../../shared/hybridConfidence.js',import.meta.url).href);
  const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
  const result={type:'DIRECT',hybridConfidence:{status:'EXPERIMENTAL',version:'hybrid-confidence-v1',originalType:'DIRECT',score:13,reviewerAgrees:false}};
  const before=structuredClone(result);
  const html=renderToStaticMarkup(React.createElement(Component,{result}));
  assert.match(html,/<h3>Low confidence<\/h3>/);assert.match(html,/13%/);assert.match(html,/uncalibrated/);
  assert.doesNotMatch(html,/<h3>Experimental/);assert.deepEqual(result,before);
  result.hybridConfidence={...result.hybridConfidence,status:'INCOMPLETE',score:null};
  const pending=renderToStaticMarkup(React.createElement(Component,{result}));
  assert.match(pending,/Checks incomplete/);assert.doesNotMatch(pending,/Low confidence<\/h3>|Very confident<\/h3>/);
});
