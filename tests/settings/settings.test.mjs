import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('settings renders an accessible dialog, public demo link and honest display toggle',async()=>{
  const url=new URL('../../src/WorkspaceSettings.jsx',import.meta.url);
  const source=await readFile(url,'utf8');
  let {code}=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
  code=code.replace(/import "\.\/settings\.css";?/,'');
  for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
  code=code.replaceAll('./lib/visualPreference.js',new URL('../../src/lib/visualPreference.js',import.meta.url).href);
  const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
  const html=renderToStaticMarkup(React.createElement(Component));
  assert.match(html,/<dialog[^>]*aria-labelledby="settings-title"/);
  assert.match(html,/href="\/hybrid-confidence-demo.html" target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/role="switch"/);
  assert.match(html,/Analysis and scoring stay the same/);
  assert.match(source,/showModal\(\)/);assert.match(source,/\.close\(\)/);
  const app=await readFile(new URL('../../src/App.jsx',import.meta.url),'utf8');
  assert.match(app,/<WorkspaceSettings \/>/);
  assert.ok((await readFile(new URL('../../public/hybrid-confidence-demo.html',import.meta.url),'utf8')).includes('calculateDemo'));
});
