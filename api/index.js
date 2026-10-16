// Keep startup failures observable as safe JSON, without exposing keys or stack traces.
let bootstrap;
export default async function handler(req,res){
 try{
  bootstrap??=import('../server.js');
  const {default:app}=await bootstrap;
  return app(req,res);
 }catch(error){
  const message=String(error?.message??'');
  const code=/DEMO_USER_IDS/.test(message)?'DEMO_ACCESS_NOT_CONFIGURED':/ANTHROPIC_API_KEY/.test(message)?'MODEL_KEY_NOT_CONFIGURED':/ENOENT/.test(message)?'RUNTIME_FILE_MISSING':'BACKEND_STARTUP_FAILED';
  const locations=String(error?.stack??'').split('\n').slice(1,8).map(line=>line.match(/([^/\\()\s]+:\d+:\d+)\)?$/)?.[1]).filter(Boolean);
  const resource=error?.code==='ENOENT'?String(error.path??'').split(/[/\\]/).pop():null;
  console.error(JSON.stringify({event:'backend_startup_failed',code,errorName:error?.name??'Error',locations,...(resource&&/^[a-zA-Z0-9_.-]{1,100}$/.test(resource)?{missingResource:resource}:{})}));
  if(!res.headersSent)return res.status(503).set('Cache-Control','no-store').json({error:`The website backend could not start (${code}). Check Vercel runtime logs and deployment configuration. Saved documents are unchanged.`,code});
  res.end();
 }
}
