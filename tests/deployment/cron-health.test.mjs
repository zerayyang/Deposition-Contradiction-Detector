import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCronHealth} from '../../server/cronHealth.js';
import {createApp} from '../../server/app.js';

// No listener, model or network. The secret is a fictional test value.
const SECRET='test-cron-secret-not-real';
const response=()=>{const r={code:200,headers:{},body:null,status(n){r.code=n;return r;},set(k,v){r.headers[k]=v;return r;},json(b){r.body=b;return r;}};return r;};
const call=async(handler,authorization)=>{const res=response();await handler({headers:authorization?{authorization}:{}},res);return res;};
const healthy=async()=>({modelKeyConfigured:true,signInConfigured:true});

test('without a configured secret the scheduled check is off and logged',async()=>{
  const events=[],res=await call(createCronHealth({secret:undefined,checks:healthy,log:e=>events.push(e)}),`Bearer ${SECRET}`);
  assert.equal(res.code,503);assert.equal(events[0].outcome,'NOT_CONFIGURED');
});

test('a wrong or missing secret is refused and logged without echoing it',async()=>{
  const events=[],handler=createCronHealth({secret:SECRET,checks:healthy,log:e=>events.push(e)});
  for(const auth of [undefined,'Bearer wrong',`Bearer ${SECRET}x`]){const res=await call(handler,auth);assert.equal(res.code,401);}
  assert.ok(events.every(e=>e.outcome==='UNAUTHORIZED'));assert.doesNotMatch(JSON.stringify(events),/wrong|test-cron-secret/);
});

test('a healthy deployment returns OK and logs the outcome with duration',async()=>{
  const events=[],res=await call(createCronHealth({secret:SECRET,checks:healthy,log:e=>events.push(e)}),`Bearer ${SECRET}`);
  assert.equal(res.code,200);assert.equal(res.body.ok,true);assert.equal(res.body.callsClaude,false);
  assert.equal(events[0].event,'cron_health_check');assert.equal(events[0].outcome,'OK');assert.deepEqual(events[0].failing,[]);assert.equal(typeof events[0].durationMs,'number');
});

test('a missing setting is reported as DEGRADED with its name, never its value',async()=>{
  const events=[],res=await call(createCronHealth({secret:SECRET,checks:async()=>({modelKeyConfigured:false,signInConfigured:true}),log:e=>events.push(e)}),`Bearer ${SECRET}`);
  assert.equal(res.code,503);assert.equal(res.body.ok,false);assert.deepEqual(events[0].failing,['modelKeyConfigured']);
});

test('a check that throws is logged as CHECK_ERROR without details',async()=>{
  const events=[],res=await call(createCronHealth({secret:SECRET,checks:async()=>{throw new Error('PRIVATE_DETAIL');},log:e=>events.push(e)}),`Bearer ${SECRET}`);
  assert.equal(res.code,500);assert.equal(events[0].outcome,'CHECK_ERROR');assert.doesNotMatch(JSON.stringify([events,res.body]),/PRIVATE_DETAIL/);
});

test('the route is registered before user sign-in and Vercel schedules it daily',()=>{
  const handler=createCronHealth({secret:SECRET,checks:healthy});
  const app=createApp({instructions:'rules',callModel:()=>{},cronHealth:handler});
  const layers=app.router.stack.map(l=>l.route?.path??l.handle.name??'');
  const cronAt=layers.indexOf('/api/cron/health'),authAt=app.router.stack.findIndex(l=>l.handle.constructor.name==='AsyncFunction'&&!l.route);
  assert.ok(cronAt>=0&&cronAt<authAt,JSON.stringify({cronAt,authAt}));
  const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.crons,[{path:'/api/cron/health',schedule:'0 13 * * *'}]);
});
