import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {captureBuildIdentity} from './buildIdentity.js';
import {createApp} from './app.js';
test('startup identity fingerprints prompts and schema as well as code and remains a snapshot',async t=>{
 const root=await fs.mkdtemp(path.join(tmpdir(),'build-identity-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const dir of ['server','shared'])await fs.mkdir(path.join(root,dir));
 for(const [name,value] of Object.entries({'server/app.js':'code','server/proper_prompts.md':'first prompt','server/schema.json':'{}','shared/limits.js':'limits','package-lock.json':'{}','package.json':'{}'}))await fs.writeFile(path.join(root,name),value);
 const options={model:'fixture-model',instructions:'first prompt',startedAt:'2026-10-16T00:00:00Z',commit:'secret-not-a-commit'};
 const before=captureBuildIdentity(root,options);assert.equal(before.commit,null);assert.equal(before.model,'fixture-model');
 await fs.writeFile(path.join(root,'server/proper_prompts.md'),'new prompt');const after=captureBuildIdentity(root,{...options,instructions:'new prompt'});
 assert.notEqual(before.codeFingerprint,after.codeFingerprint);assert.notEqual(before.promptSha256,after.promptSha256);assert.notEqual(before.promptFiles['server/proper_prompts.md'],after.promptFiles['server/proper_prompts.md']);
 const stable=captureBuildIdentity(root,{...options,instructions:'new prompt',startedAt:'later'});assert.equal(stable.codeFingerprint,after.codeFingerprint);
 await fs.writeFile(path.join(root,'server/schema.json'),'changed');assert.notEqual(captureBuildIdentity(root,options).codeFingerprint,after.codeFingerprint);
});
test('free unauthenticated health publishes only startup provenance and invokes no external service',()=>{
 const provenance={version:1,codeFingerprint:'fixture-build',promptSha256:'fixture-prompt',model:'fixture-model',startedAt:'2026-10-16T00:00:00Z',commit:null};
 let externalCalls=0;const app=createApp({instructions:'fixture',runtimeIdentity:provenance,callModel:()=>{externalCalls++;},authenticate:()=>{externalCalls++;}});
 const route=app.router.stack.find(layer=>layer.route?.path==='/api/health').route.stack[0].handle;
 let received;route({}, {set(){return this;},json(body){received=body;}});
 assert.deepEqual(received.provenance,provenance);assert.equal(received.callsClaude,false);assert.equal(externalCalls,0);
});
