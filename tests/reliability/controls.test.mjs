import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdmission,createRateLimit,createMeasuredModel} from '../../server/runtimeControls.js';
import {createAuthentication} from '../../server/authentication.js';
import {createApp} from '../../server/app.js';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
test('concurrency admission rejects overload and releases capacity after success or exception',async()=>{
 const gate=createAdmission();let release;const first=gate.run('a',()=>new Promise(r=>{release=r;}));
 await assert.rejects(gate.run('b',()=>assert.fail('overload must not run')),e=>e.status===429);release();await first;
 await assert.rejects(gate.run('a',async()=>{throw new Error('crash');}),/crash/);assert.equal(gate.active,0);await gate.run('a',async()=>{});
});
test('rate limits are per identity and expire without resetting another identity',()=>{
 let time=1;const allow=createRateLimit({limit:2,windowMs:10,now:()=>time});assert.equal(allow('a'),true);assert.equal(allow('a'),true);assert.equal(allow('a'),false);assert.equal(allow('b'),true);time=12;assert.equal(allow('a'),true);
});
test('timeouts and cancellation stop hung mock calls; logs omit source text and credentials',async()=>{
 const events=[],keepAlive=setTimeout(()=>{},100);try{
 const call=createMeasuredModel(async()=>new Promise(()=>{}),{timeoutMs:10,log:e=>events.push(e)});
 await assert.rejects(call({messages:[{content:'PRIVATE_SOURCE'}]}),/timeout/i);assert.equal(events[0].category,'TIMEOUT');assert.doesNotMatch(JSON.stringify(events),/PRIVATE_SOURCE|messages/);
 const controller=new AbortController(),run=call({}, {signal:controller.signal});controller.abort();await assert.rejects(run);assert.equal(events[1].category,'CANCELLED');
 }finally{clearTimeout(keepAlive);}
});
test('public configuration cannot silently fall back to unauthenticated mode',async()=>{
 assert.throws(()=>createAuthentication({allowLocal:false}),/Configure SUPABASE/);
 const local=createAuthentication({allowLocal:true});assert.equal((await local({headers:{},socket:{remoteAddress:'127.0.0.1'}})).id,'local-development');
 await assert.rejects(local({headers:{},socket:{remoteAddress:'203.0.113.1'}}),/Local access/);
});
test('API authentication and heavy admission run before JSON parsing; rejected requests never parse',async()=>{
 let calls=0;const app=createApp({instructions:'rules',callModel:async()=>{calls++;},authenticate:async req=>{if(req.headers.authorization!=='Bearer valid')throw new Error('bad');return {id:'a'};}});
 const middleware=app.router.stack.find(l=>l.handle.constructor.name==='AsyncFunction').handle;
 const res=()=>Object.assign(new EventEmitter(),{statusCode:200,headersSent:false,status(n){this.statusCode=n;return this;},set(){return this;},json(b){this.body=b;return this;}});
 const bad=res();await middleware({headers:{},method:'POST',path:'/analyze'},bad,()=>assert.fail('must not parse'));assert.equal(bad.statusCode,401);
 const first=res();let admitted;const ready=new Promise(r=>{admitted=r;});const running=middleware({headers:{authorization:'Bearer valid'},method:'POST',path:'/analyze'},first,admitted);await ready;
 const second=res();await middleware({headers:{authorization:'Bearer valid'},method:'POST',path:'/analyze'},second,()=>assert.fail('overload must not parse'));assert.equal(second.statusCode,429);first.emit('close');await running;assert.equal(calls,0);
});
test('malformed and oversized JSON are rejected without a model or listening socket',async()=>{
 const app=createApp({instructions:'rules',callModel:()=>assert.fail('no model'),requestLimitBytes:64});const parser=app.router.stack.find(l=>l.name==='jsonParser').handle;
 const parse=body=>new Promise(resolve=>{const req=Readable.from([Buffer.from(body)]);req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(body))};req.method='POST';parser(req,{},e=>resolve(e));});
 assert.ok(await parse('{broken'));assert.equal((await parse(JSON.stringify({text:'x'.repeat(100)}))).type,'entity.too.large');
});
test('an already cancelled model request never reaches the provider or leaves an unhandled rejection',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();const run=createMeasuredModel(async()=>{calls++;return {};});
 await assert.rejects(run({}, {signal:controller.signal}));assert.equal(calls,0);
});
test('hosting configuration requires private recovery storage, an allowlist and bounded valid settings',async()=>{
 const {runtimeConfiguration}=await import('../../server/configuration.js');const root='/tmp/fictional-app';
 assert.throws(()=>runtimeConfiguration({NODE_ENV:'production'},root),/DEMO_USER_IDS/);
 assert.throws(()=>runtimeConfiguration({NODE_ENV:'production',DEMO_USER_IDS:'alice'},root),/ANALYSIS_JOB_DIR/);
 assert.throws(()=>runtimeConfiguration({ANALYSIS_JOB_DIR:root+'/public/jobs'},root),/publicly served/);
 assert.throws(()=>runtimeConfiguration({PORT:'70000'},root),/port/);
 assert.throws(()=>runtimeConfiguration({MAX_ANALYSIS_BUDGET_USD:'NaN'},root),/spending/);
 const c=runtimeConfiguration({NODE_ENV:'production',DEMO_USER_IDS:'alice,bob',ANALYSIS_JOB_DIR:'/var/data/jobs'},root);assert.equal(c.host,'0.0.0.0');assert.deepEqual(c.allowedUserIds,['alice','bob']);
 assert.equal(runtimeConfiguration({},root).host,'127.0.0.1');
});
test('HTTP error logs record outcome and duration without request bodies, URLs or credentials',()=>{
 const events=[],app=createApp({instructions:'rules',callModel:()=>{},log:e=>events.push(e)});
 const audit=app.router.stack.find(l=>l.handle.name==='auditApiRequest').handle,res=Object.assign(new EventEmitter(),{statusCode:401,writableEnded:true});
 audit({method:'POST',body:{transcript1:'PRIVATE_TEST_TEXT'},url:'/api?secret=PRIVATE_TOKEN',headers:{authorization:'Bearer PRIVATE_TOKEN'}},res,()=>{});res.emit('finish');res.emit('close');
 assert.equal(events.length,1);assert.equal(events[0].status,401);assert.doesNotMatch(JSON.stringify(events),/PRIVATE_TEST_TEXT|PRIVATE_TOKEN|authorization|transcript1/);
});
test('the server runs up to four analyses at once, still one per user',async()=>{
 const gate=createAdmission({maxConcurrent:4}),releases=[];
 const running=['a','b','c','d'].map(u=>gate.run(u,()=>new Promise(r=>releases.push(r))));
 await assert.rejects(gate.run('a',async()=>{}),e=>e.status===429,'same user twice');
 await assert.rejects(gate.run('e',async()=>{}),e=>e.status===429,'fifth user waits');
 releases.forEach(r=>r());await Promise.all(running);assert.equal(gate.active,0);
 await gate.run('e',async()=>{});
});
