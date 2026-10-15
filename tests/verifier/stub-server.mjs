// Isolated test child: load the real unchanged server, replace only SDK transport
// and bind its listener to a random local port. No real Claude requests occur.
import { registerHooks } from 'node:module';
import express from 'express';
import { fileURLToPath } from 'node:url';
globalThis.__verifierStubQueue=JSON.parse(process.env.VERIFIER_STUB_RESPONSES??'[]');
registerHooks({resolve(specifier,context,nextResolve) {
  if(specifier==='@anthropic-ai/sdk')return {url:new URL('./stub-llm.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}});
let server;
const listen=express.application.listen;
express.application.listen=function(...args) {
  const originalCallback=args.find(value=>typeof value==='function');
  server=listen.call(this,0,'127.0.0.1',error=>{
    if(error){process.send?.({type:'error',error:error.message});return;}
    originalCallback?.();
    process.send?.({type:'ready',port:server.address().port});
  });
  return server;
};
process.on('message',message=>{if(message?.type==='close'){server?.close(()=>process.exit(0));server?.closeAllConnections?.();}});
process.on('disconnect',()=>process.exit(0));
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
await import('../../server/server.js');
