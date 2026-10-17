import {timingSafeEqual} from 'node:crypto';

// Scheduled deployment self-check (Vercel Cron). It verifies configuration only:
// no model call, no user data, no secrets in the response or log. Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; without a configured secret the route is off.
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};

export function createCronHealth({secret,checks,log=()=>{}}){
 return async function cronHealth(req,res){
  const began=performance.now();
  if(!secret){log({event:'cron_health_check',outcome:'NOT_CONFIGURED'});return res.status(503).json({error:'Scheduled checks are not configured.'});}
  if(!same(req.headers?.authorization??'',`Bearer ${secret}`)){log({event:'cron_health_check',outcome:'UNAUTHORIZED'});return res.status(401).json({error:'Unauthorized.'});}
  let results;
  try{results=await checks();}
  catch{log({event:'cron_health_check',outcome:'CHECK_ERROR',durationMs:Math.round(performance.now()-began)});return res.status(500).json({ok:false,error:'A configuration check failed to run.'});}
  const failing=Object.entries(results).filter(([,value])=>value===false).map(([name])=>name);
  const ok=failing.length===0;
  log({event:'cron_health_check',outcome:ok?'OK':'DEGRADED',failing,durationMs:Math.round(performance.now()-began)});
  return res.set('Cache-Control','no-store').status(ok?200:503).json({ok,checks:results,callsClaude:false});
 };
}
