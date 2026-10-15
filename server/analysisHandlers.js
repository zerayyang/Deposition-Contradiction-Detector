import {buildPlan,previewPlan,executePlan} from './documentAnalysis.js';
export function createAnalysisHandlers({instructions,callModel}) {
  const prepare=body=>buildPlan([body?.transcript1,body?.transcript2],body?.documents,instructions);
  return {
    preview(req,res){try{return res.json(previewPlan(prepare(req.body)));}catch(e){return res.status(400).json({error:e.message});}},
    async analyze(req,res){
      let plan;try{plan=prepare(req.body);}catch(e){return res.status(400).json({error:e.message});}
      if(plan.requestCount!==1)return res.status(428).json({error:'This document pair requires a multi-request plan. Preview /api/analysis/plan and explicitly approve it before starting /api/analyze/stream.',plan:previewPlan(plan)});
      const controller=new AbortController();
      const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
      try{
        const result=await executePlan({plan,texts:[req.body.transcript1,req.body.transcript2],instructions,callModel,signal:controller.signal});
        if(result.analysis.status==='failed')return res.status(500).json({error:'Failed to analyze depositions',details:result.analysis.tasks[0]?.error,analysis:result.analysis});
        return res.json(result);
      }catch(e){if(!res.destroyed)return res.status(500).json({error:'Failed to analyze depositions',details:e.message});}
      finally{res.off('close',close);}
    },
    async stream(req,res){
      let plan;
      try{plan=prepare(req.body);if(req.body.approvedPlanId!==plan.id)return res.status(409).json({error:'The analysis plan changed or was not approved. Preview and approve the current request count and cost first.'});}
      catch(e){return res.status(400).json({error:e.message});}
      const controller=new AbortController();
      const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
      res.status(200).set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders?.();
      const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(JSON.stringify({event:'heartbeat'})+'\n');},15000);
      try{await executePlan({plan,texts:[req.body.transcript1,req.body.transcript2],instructions,callModel,signal:controller.signal,onEvent:event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');}});}
      catch(e){if(!res.destroyed)res.write(JSON.stringify({event:'error',error:e.message,status:'failed'})+'\n');}
      finally{clearInterval(heartbeat);res.off('close',close);if(!res.destroyed)res.end();}
    }
  };
}
