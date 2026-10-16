import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=text=>createHash('sha256').update(text).digest('hex');
// Compute once during startup. Health reports the loaded build, not live files
// that could change underneath an already running process. No env secrets.
export function captureBuildIdentity(root,{model,instructions,commit=null,startedAt=new Date().toISOString()}={}) {
 const hash=createHash('sha256'),prompts={};
 for(const dir of ['server','shared'])for(const name of fs.readdirSync(path.join(root,dir),{recursive:true}).filter(n=>/\.(?:js|json|md)$/.test(n)).sort()){
  const relative=dir+'/'+name,bytes=fs.readFileSync(path.join(root,relative));
  hash.update(relative).update('\0').update(bytes).update('\0');
  if(name.endsWith('.md'))prompts[relative]=sha(bytes);
 }
 for(const name of ['package.json','package-lock.json'])hash.update(name).update('\0').update(fs.readFileSync(path.join(root,name))).update('\0');
 return Object.freeze({version:1,codeFingerprint:hash.digest('hex'),promptSha256:sha(instructions),promptFiles:Object.freeze(prompts),model,startedAt,
  commit:typeof commit==='string'&&/^[a-f0-9]{7,40}$/.test(commit)?commit:null});
}
