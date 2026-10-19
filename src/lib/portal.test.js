import test from 'node:test';
import assert from 'node:assert/strict';
import {chosenPortal,choosePortal} from './portal.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
test('the portal choice defaults to the workspace and remembers admin',()=>{
 const s=memory();assert.equal(chosenPortal(s),'workspace');
 choosePortal('admin',s);assert.equal(chosenPortal(s),'admin');
 choosePortal('anything-else',s);assert.equal(chosenPortal(s),'workspace');
});
test('blocked storage falls back to the workspace',()=>{
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 assert.equal(chosenPortal(blocked),'workspace');assert.doesNotThrow(()=>choosePortal('admin',blocked));
});
