import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,globSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runtimeConfiguration} from '../../server/configuration.js';

const root=new URL('../../',import.meta.url);
test('Vercel import exports the same Express app without starting a listener',()=>{
 const script=`import {Server} from 'node:net';
 Server.prototype.listen=function(){throw new Error('Unexpected listener during Vercel import');};
 const {default:app}=await import('./server.js');
 const {default:handler}=await import('./api/index.js');
 if(typeof app!=='function'||typeof handler!=='function')throw new Error('Invalid Express export');
 let response;
 await handler({url:'/api/health',method:'GET',headers:{},socket:{}},{setHeader(){},getHeader(){},end(body){response=JSON.parse(body);},on(){},once(){},emit(){}});
 if(response?.status!=='ok'||response.callsClaude!==false)throw new Error('Original health route unavailable');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8',env:{...process.env,VERCEL:'1',NODE_ENV:'production',DEMO_USER_IDS:'deployment-test',ANTHROPIC_API_KEY:'test-not-a-secret',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-not-a-secret'}});
 assert.equal(result.status,0,result.stderr);
});
test('Vercel retains authentication requirements but does not require a persistent volume',()=>{
 assert.throws(()=>runtimeConfiguration({VERCEL:'1'},'/tmp/project'),/DEMO_USER_IDS/);
 assert.equal(runtimeConfiguration({VERCEL:'1',DEMO_USER_IDS:'test'},'/tmp/project').production,true);
 assert.throws(()=>runtimeConfiguration({NODE_ENV:'production',DEMO_USER_IDS:'test'},'/tmp/project'),/persistent volume/);
});
test('Vite preset routes API requests to the 60-second function; dev proxy remains local',()=>{
 const config=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
 assert.equal(config.framework,'vite');assert.equal(config.outputDirectory,'dist');
 assert.equal(config.functions['api/index.js'].maxDuration,60);
 assert.deepEqual(config.rewrites,[{source:'/api/(.*)',destination:'/api/index'}]);
 assert.match(readFileSync(new URL('vite.config.js',root),'utf8'),/['"]\/api['"]:\s*['"]http:\/\/127\.0\.0\.1:3000['"]/);
});

test('Vercel includeFiles is a single glob string and bundles runtime file reads',()=>{
 const config=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
 const pattern=config.functions['api/index.js'].includeFiles;
 assert.equal(typeof pattern,'string','Vercel rejects an array for includeFiles');
 const files=globSync(pattern,{cwd:root});
 for(const required of ['server/proper_prompts.md','server/status.html','server/configuration.js','server/authentication.js','server/sourceContext.js','shared/documentLimits.js','package-lock.json'])assert.ok(files.includes(required),`Missing runtime resource: ${required}`);
 assert.ok(!files.some(file=>file.startsWith('tests/')||file.startsWith('.env')||file.startsWith('.analysis-jobs/')));
});

test('startup errors return redacted JSON codes rather than crashing the adapter',()=>{
 const script=`delete process.env.DEMO_USER_IDS;
 const {default:handler}=await import('./api/index.js');let code,result;
 const res={headersSent:false,status(n){code=n;return this;},set(){return this;},json(v){result=v;return this;}};
 await handler({url:'/api/health',method:'GET'},res);
 if(code!==503||result.code!=='DEMO_ACCESS_NOT_CONFIGURED')throw Error('Missing startup diagnostic');
 if(JSON.stringify(result).includes('SECRET_SENTINEL'))throw Error('Credential disclosed');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8',env:{...process.env,VERCEL:'1',ANTHROPIC_API_KEY:'SECRET_SENTINEL'}});
 assert.equal(result.status,0,result.stderr);assert.ok(!result.stderr.includes('SECRET_SENTINEL'));
});
