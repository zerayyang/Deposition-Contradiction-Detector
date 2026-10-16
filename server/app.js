import express from 'express';
import {createEventHandlers} from './events/handlers.js';
import fs from 'node:fs';
import path from 'node:path';
import {DOCUMENT_LIMITS} from '../shared/documentLimits.js';
import {createAnalysisHandlers} from './analysisHandlers.js';
import {createAdmission,createRateLimit} from './runtimeControls.js';
// Factory imports start no listener, invoke no model and read no credentials.
export function createApp({instructions,callModel,requestLimitBytes=DOCUMENT_LIMITS.requestBytes,authenticate=null,jobStore=null,codeFingerprint,maxRequests,maxBudgetUsd,log=()=>{},staticDirectory=null,readApprovedMemory=null}) {
 const app=express(),admission=createAdmission(),recoveryAdmission=createAdmission(),allowed=createRateLimit(),ipAllowed=createRateLimit({limit:90});app.disable('x-powered-by');
 app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});next();});
 app.get('/api/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',service:'deposition-backend',uptimeSeconds:Math.floor(process.uptime()),externalServices:'not checked',callsClaude:false}));
 app.use('/api',function auditApiRequest(req,res,next){
  const began=performance.now();let recorded=false;
  const record=()=>{if(recorded)return;recorded=true;res.off('finish',record);res.off('close',record);log({event:'http_request_finished',method:req.method,route:typeof req.route?.path==='string'?req.route.path:'/api',status:res.statusCode,durationMs:Math.round(performance.now()-began),connectionEnded:!res.writableEnded});};
  res.once('finish',record);res.once('close',record);next();
 });
 app.use('/api',async(req,res,next)=>{
  if(!ipAllowed(req.socket?.remoteAddress??'test-local'))return res.status(429).set('Retry-After','60').json({error:'Too many requests. Wait one minute.'});
  try{req.identity=authenticate?await authenticate(req):{id:'test-local'};}catch{return res.status(401).json({error:'Sign in again before accessing analysis or recovery.'});}
  if(!allowed(req.identity.id))return res.status(429).set('Retry-After','60').json({error:'Too many requests. Wait one minute and try again.'});
  // Admit heavy requests BEFORE parsing JSON, so rejected parallel uploads
  // cannot each allocate the entire request-body budget.
  const storageRequest=/^\/(?:analysis|events)\/jobs(?:\/|$)/.test(req.path);
  if(storageRequest||req.method==='POST'&&['/analysis/plan','/analyze','/analyze/stream','/events/plan','/events/stream','/events/sources'].includes(req.path)){
   const gate=storageRequest?recoveryAdmission:admission;
   try{await gate.run(req.identity.id,()=>new Promise(resolve=>{const done=()=>{res.off('finish',done);res.off('close',done);resolve();};res.once('finish',done);res.once('close',done);next();}));}
   catch(e){if(!res.headersSent)res.status(e.status??500).set('Retry-After','30').json({error:e.status?e.message:'Analysis could not start.'});}
   return;
  }
  next();
 });
 app.use(express.json({limit:requestLimitBytes}));
 app.use((error,_req,res,next)=>{
  if(error.type==='entity.too.large')return res.status(413).json({error:'Analysis request exceeds the server size budget. No document was truncated and no model request started.'});
  if(error instanceof SyntaxError)return res.status(400).json({error:'Invalid JSON request.'});next(error);
 });
 const events=createEventHandlers({callModel,jobStore,codeFingerprint,maxRequests,maxBudgetUsd,log,readApprovedMemory});
 app.post('/api/events/sources',events.sources);app.post('/api/events/plan',events.preview);app.post('/api/events/stream',events.stream);
 app.get('/api/events/jobs',events.list);app.get('/api/events/jobs/:id',events.recover);app.post('/api/events/jobs/:id/cancel',events.cancel);app.delete('/api/events/jobs/:id',events.remove);
 const handlers=createAnalysisHandlers({instructions,callModel,jobStore,codeFingerprint,maxRequests,maxBudgetUsd,log});
 app.post('/api/analysis/plan',handlers.preview);app.post('/api/analyze',handlers.analyze);app.post('/api/analyze/stream',handlers.stream);
 app.get('/api/analysis/jobs',handlers.list);app.get('/api/analysis/jobs/:id',handlers.recover);app.delete('/api/analysis/jobs/:id',handlers.remove);app.post('/api/analysis/jobs/:id/cancel',handlers.cancel);
 app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
 if(staticDirectory){app.use(express.static(staticDirectory,{index:'index.html'}));app.get('/{*splat}',(req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(path.join(staticDirectory,'index.html'));});}
 else {const statusPage=fs.readFileSync(new URL('./status.html',import.meta.url),'utf8');app.get('/',(_req,res)=>res.set('Cache-Control','no-store').type('html').send(statusPage));}
 app.use((error,_req,res,_next)=>{void error;void _next;if(!res.headersSent)res.status(500).json({error:'The server could not complete this request. Saved progress has not been deleted.'});});
 return app;
}
