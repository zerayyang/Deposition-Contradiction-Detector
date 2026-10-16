import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {captureBuildIdentity} from './buildIdentity.js';
import {MODEL} from './documentAnalysis.js';
import {createCloudStoreFactory} from './cloudJobStore.js';
import {createApp} from './app.js';
import {createApprovedMemoryReader} from './memory/approvedMemory.js';
import {createJobStore} from './jobStore.js';
import {createAuthentication} from './authentication.js';
import {runtimeConfiguration} from './configuration.js';
import {createMeasuredModel} from './runtimeControls.js';
// Vercel supplies deployment secrets through environment variables.
if(!process.env.VERCEL)dotenv.config({path:['.env.local','.env'],quiet:true});
const root=fileURLToPath(new URL('../',import.meta.url));
const {production,host,port,allowedUserIds,directory,maxBudgetUsd,maxRequests,timeoutMs}=runtimeConfiguration(process.env,root);
const log=event=>process.stdout.write(JSON.stringify({timestamp:new Date().toISOString(),...event})+'\n');
const authenticate=createAuthentication({url:process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY,allowLocal:!process.env.VERCEL&&!production&&host==='127.0.0.1',allowedUserIds});
if(!process.env.ANTHROPIC_API_KEY)throw new Error('ANTHROPIC_API_KEY is required.');
const instructions=fs.readFileSync(new URL('./proper_prompts.md',import.meta.url),'utf8');
const runtimeIdentity=captureBuildIdentity(root,{model:MODEL.id,instructions,commit:process.env.VERCEL_GIT_COMMIT_SHA});
const codeFingerprint=runtimeIdentity.codeFingerprint;
const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:600000});
const callModel=createMeasuredModel((params,options)=>anthropic.messages.create(params,options),{timeoutMs,log});
const app=createApp({readApprovedMemory:createApprovedMemoryReader({url:process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY}),instructions,callModel,authenticate,runtimeIdentity,cloudStoreForRequest:process.env.VERCEL?createCloudStoreFactory({signingKey:process.env.ANALYSIS_JOB_SIGNING_KEY??process.env.ANTHROPIC_API_KEY,url:process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY}):null,jobStore:process.env.VERCEL?null:createJobStore(directory),codeFingerprint,maxRequests,maxBudgetUsd,log,staticDirectory:production&&!process.env.VERCEL?path.join(root,'dist'):null});
export default app;

// Keep the existing local entry point, but never bind a port in Vercel.
if(!process.env.VERCEL){
const server=app.listen(port,host,()=>log({event:'server_started',port,mode:production?'production':'local',recoveryEnabled:true}));
server.requestTimeout=120000; // Receive the request body within two minutes; this is not a response-stream deadline.
server.headersTimeout=30000;
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(stopping)return;stopping=true;log({event:'server_stopping'});server.close();setTimeout(()=>process.exit(0),15000).unref();});
}
