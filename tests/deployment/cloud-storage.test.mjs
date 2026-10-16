import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudObjectStore} from '../../server/cloudJobStore.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',caseId='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222';
function fixture(){
 const objects=new Map();let allowed=true,uploads=0;
 const bucket={upload:async(path,text,options)=>{uploads++;assert.equal(options.upsert,false);if(objects.has(path))return {error:{statusCode:409}};objects.set(path,text);return {};},download:async path=>objects.has(path)?{data:{text:async()=>objects.get(path)}}:{error:{statusCode:404}},list:async(folder,{search,offset,limit})=>({data:[...objects.keys()].filter(p=>p.startsWith(folder+'/')&&p.split('/').at(-1).includes(search)).map(p=>({name:p.split('/').at(-1)})).slice(offset,offset+limit)})};
 const query={select(){return this;},eq(){return this;},async single(){return allowed?{data:{id:caseId,owner_id:owner}}:{error:{message:'denied'}};}};
 const client={storage:{from:name=>{assert.equal(name,'case-originals');return bucket;}},from:()=>query};
 const make=(identity=owner,key='fictional-test-only-key')=>cloudObjectStore(client,identity,{signingKey:key});
 return {objects,make,set allowed(v){allowed=v;},get uploads(){return uploads;}};
}
test('private checkpoints round trip with immutable claims and owned-case checks',async()=>{
 const f=fixture(),s=f.make();await s.authorize(caseId);f.allowed=false;await assert.rejects(s.authorize(caseId),/unavailable/);
 assert.equal(await s.put(caseId,job,'manifest',{count:1}),true);assert.equal(await s.put(caseId,job,'manifest',{count:2}),false);assert.deepEqual(await s.get(caseId,job,'manifest'),{count:1});assert.equal(await s.get(caseId,job,'absent'),null);
});
test('checkpoint tampering, moved records and changed signing keys are rejected',async()=>{
 const f=fixture(),s=f.make();await s.put(caseId,job,'manifest',{count:1});const path=[...f.objects.keys()][0],original=f.objects.get(path),envelope=JSON.parse(original);envelope.payload.count=9;f.objects.set(path,JSON.stringify(envelope));await assert.rejects(s.get(caseId,job,'manifest'),/signature/);
 f.objects.set(path,original);await assert.rejects(f.make(owner,'different-key').get(caseId,job,'manifest'),/signature/);
 f.objects.set(path.replace('manifest.txt','copied.txt'),original);await assert.rejects(s.get(caseId,job,'copied'),/signature/);
 assert.equal(await f.make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').get(caseId,job,'manifest'),null);
});
test('latest progress uses numeric checkpoint order and ignores claims and other jobs',async()=>{
 const f=fixture(),s=f.make();assert.deepEqual(await s.latest(caseId,job),{latest:null,sequence:0,spent:0});
 for(const n of [0,2,10])await s.put(caseId,job,`s${n}-result`,{result:{step:n},totalSpentUsd:n/10});await s.put(caseId,job,'s11-claim',{});
 assert.deepEqual(await s.latest(caseId,job),{latest:{step:10},sequence:11,spent:1});
});
