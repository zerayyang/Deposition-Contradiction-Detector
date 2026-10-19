import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const url=new URL('../../src/FindingSource.jsx',import.meta.url);
const transformed=await transformWithOxc(await readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replaceAll('from "react/jsx-runtime"',`from "${import.meta.resolve('react/jsx-runtime')}"`)
  .replaceAll('./lib/sourceStatus.js',new URL('../../src/lib/sourceStatus.js',import.meta.url).href);
const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
test('missing citation stays explicit and complete source text remains available without guessing',()=>{
  const text='Q: Synthetic question?\nA: Synthetic answer.\n<not-markup>';
  const html=renderToStaticMarkup(React.createElement(Component,{number:1,text,claim:{original:'Unlocated synthetic quote.'},binding:{status:'NOT_FOUND'}}));
  assert.match(html,/Exact source location unavailable/);assert.match(html,/no location has been guessed/);
  assert.match(html,/View full transcript 1/);assert.match(html,/Synthetic answer/);
  assert.match(html,/&lt;not-markup&gt;/);assert.doesNotMatch(html,/PDF page|<mark/);
  assert.match(html,/No original file was saved/);
});
test('saved file reference exposes original download and retains exact saved page reference',()=>{
  let downloads=0;
  const props={number:2,text:'Q: Synthetic?\nA: Yes.',file:{path:'private/fake.pdf',name:'synthetic.pdf',type:'application/pdf'},
    references:[{pdfPage:4}],binding:{status:'BOUND'},onDownload:()=>downloads++};
  const tree=Component(props),html=renderToStaticMarkup(tree);
  assert.match(html,/synthetic.pdf/);assert.match(html,/PDF page 4/);assert.match(html,/Download original PDF/);
  assert.doesNotMatch(html,/private\/fake.pdf|location unavailable/);
  tree.props.children.find(child=>child?.type==='button').props.onClick();assert.equal(downloads,1);
});
test('absent full text and saved metadata do not produce empty source references',()=>{
  const html=renderToStaticMarkup(React.createElement(Component,{number:1,references:[{}]}));
  assert.match(html,/Full text is unavailable/);assert.match(html,/Exact source location unavailable/);
});
