import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('settings links the future workflow concept next to the confidence guide',async()=>{
  const settings=await readFile(new URL('../../src/WorkspaceSettings.jsx',import.meta.url),'utf8');
  assert.match(settings,/Confidence, explained[\s\S]*Future workflow \(concept\)/);
  assert.match(settings,/href="\/future-workflow.html" target="_blank" rel="noopener noreferrer"/);
  const page=await readFile(new URL('../../public/future-workflow.html',import.meta.url),'utf8');
  assert.match(page,/^<!doctype html>/);
  for(const step of ['Find the record','Download','The helper asks','Works offscreen','Ready','Review'])assert.ok(page.includes(step),step);
  assert.match(page,/fictional/i);
});
