import test from 'node:test';
import assert from 'node:assert/strict';
import {readVisualPreference,saveVisualPreference} from './visualPreference.js';

test('visual effects preference persists on and off without saving case data',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(readVisualPreference(storage),false);
  assert.equal(saveVisualPreference(true,storage),true);
  assert.equal(readVisualPreference(storage),true);
  assert.deepEqual([...values],[['deposition:reduced-effects','true']]);
  assert.equal(saveVisualPreference(false,storage),true);
  assert.equal(readVisualPreference(storage),false);
});
test('blocked browser storage does not prevent settings use',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(readVisualPreference(storage),false);
  assert.equal(saveVisualPreference(true,storage),false);
});
