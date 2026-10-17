import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createApp} from '../../server/app.js';
import {createMeasuredModel} from '../../server/runtimeControls.js';
import {requestIdFrom,runWithRequest,withRequestContext,currentRequestId} from '../../server/requestContext.js';

// No listener, model or network. Fictional values only.
test('request IDs: a safe incoming ID is kept, anything else is replaced',()=>{
  assert.equal(requestIdFrom('abc-123_XYZ.9'),'abc-123_XYZ.9');
  for(const bad of [undefined,'short','has space here','x'.repeat(65),'<script>alert(1)</script>'])assert.match(requestIdFrom(bad),/^[0-9a-f-]{36}$/);
});

test('log events inside a request carry its ID; outside a request they are unchanged',async()=>{
  assert.equal(currentRequestId(),null);assert.deepEqual(withRequestContext({event:'x'}),{event:'x'});
  await runWithRequest('req-12345678',async()=>{await Promise.resolve();assert.deepEqual(withRequestContext({event:'x'}),{event:'x',requestId:'req-12345678'});
    assert.deepEqual(withRequestContext({event:'x',requestId:'own-12345678'}),{event:'x',requestId:'own-12345678'});});
});

test('model call logs made during a request inherit the request ID',async()=>{
  const events=[],log=e=>events.push(withRequestContext(e));
  const call=createMeasuredModel(async()=>({stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}),{log});
  await runWithRequest('req-abcdefgh',()=>call({},{}));
  assert.equal(events.length,1);assert.equal(events[0].event,'model_request_finished');assert.equal(events[0].requestId,'req-abcdefgh');
});

test('API audit returns X-Request-Id and logs it without request content',()=>{
  const events=[],app=createApp({instructions:'rules',callModel:()=>{},log:e=>events.push(e)});
  const audit=app.router.stack.find(l=>l.handle.name==='auditApiRequest').handle;
  const headers={};const res=Object.assign(new EventEmitter(),{statusCode:500,writableEnded:true,set(k,v){headers[k]=v;return this;}});
  let insideId=null;
  audit({method:'POST',body:{transcript1:'PRIVATE_TEST_TEXT'},headers:{'x-request-id':'client-req-0001',authorization:'Bearer PRIVATE_TOKEN'}},res,()=>{insideId=currentRequestId();});
  res.emit('finish');
  assert.equal(headers['X-Request-Id'],'client-req-0001');assert.equal(insideId,'client-req-0001');
  assert.equal(events.length,1);assert.equal(events[0].requestId,'client-req-0001');assert.equal(events[0].status,500);
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_TEST_TEXT|PRIVATE_TOKEN|authorization|transcript1/);
});
