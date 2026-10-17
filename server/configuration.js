import path from 'node:path';
export function runtimeConfiguration(env,root){
 const production=Boolean(env.VERCEL)||env.NODE_ENV==='production',host=env.HOST??(production?'0.0.0.0':'127.0.0.1');
 const positive=(value,fallback)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<1)throw new Error('Invalid positive integer server configuration.');return n;};
 const allowedUserIds=env.DEMO_USER_IDS?.split(',').map(s=>s.trim()).filter(Boolean);
 if(production&&!allowedUserIds?.length)throw new Error('Set DEMO_USER_IDS for the private demo.');
 if(production&&!env.VERCEL&&!env.ANALYSIS_JOB_DIR)throw new Error('Set ANALYSIS_JOB_DIR to a private persistent volume before hosting.');
 const directory=path.resolve(env.ANALYSIS_JOB_DIR??path.join(root,'.analysis-jobs'));
 for(const exposed of ['dist','public']){const relative=path.relative(path.join(root,exposed),directory);if(relative===''||!relative.startsWith('..')&&!path.isAbsolute(relative))throw new Error('Recovery directory must not be inside publicly served files.');}
 // Local and hosted share one request allowance; the USD allowance remains the spending guard.
 const maxBudgetUsd=Number(env.MAX_ANALYSIS_BUDGET_USD??25);if(!Number.isFinite(maxBudgetUsd)||maxBudgetUsd<=0)throw new Error('Invalid analysis spending allowance.');
 const port=positive(env.PORT,3000);if(port>65535)throw new Error('Invalid server port.');
 return {production,host,port,allowedUserIds,directory,maxBudgetUsd,maxRequests:positive(env.MAX_ANALYSIS_REQUESTS,512),timeoutMs:positive(env.MODEL_TIMEOUT_MS,600000)};
}
