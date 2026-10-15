import express from 'express';
import fs from 'node:fs';
import {DOCUMENT_LIMITS} from '../shared/documentLimits.js';
import {createAnalysisHandlers} from './analysisHandlers.js';
// Importing this factory starts no listener and makes no provider request.
export function createApp({instructions,callModel,requestLimitBytes=DOCUMENT_LIMITS.requestBytes}) {
  const app=express();
  app.use(express.json({limit:requestLimitBytes}));
  app.use((error,_req,res,next)=>{
    if(error.type==='entity.too.large')return res.status(413).json({error:'Analysis request exceeds 160 MiB. No document was truncated and no model request started.'});
    if(error instanceof SyntaxError)return res.status(400).json({error:'Invalid JSON request.'});
    next(error);
  });
  const statusPage=fs.readFileSync(new URL('./status.html',import.meta.url),'utf8');
  app.get('/',(_req,res)=>res.set('Cache-Control','no-store').type('html').send(statusPage));
  app.get('/api/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',service:'deposition-backend',uptimeSeconds:Math.floor(process.uptime()),externalServices:'not checked',callsClaude:false}));
  const handlers=createAnalysisHandlers({instructions,callModel});
  let active=false;
  const paid=handler=>async(req,res)=>{
    if(active)return res.status(503).json({error:'Another analysis is running on this server. Retry after it completes or is cancelled.'});
    active=true;try{await handler(req,res);}finally{active=false;}
  };
  app.post('/api/analysis/plan',handlers.preview);
  app.post('/api/analyze',paid(handlers.analyze));
  app.post('/api/analyze/stream',paid(handlers.stream));
  return app;
}
