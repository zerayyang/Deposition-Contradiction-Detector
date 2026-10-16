import {mkdir,open,rename,readFile,readdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
// One Node process per directory. Store on a private persistent volume in hosting.
// Credentials never enter these records. These files DO contain testimony.
export function createJobStore(directory,{maxBytes=64*1024*1024,maxJobsPerOwner=10}={}) {
 const active=new Set();
 const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid recovery ID.');return path.join(directory,`${id}.json`);};
 async function write(record){
  await mkdir(directory,{recursive:true,mode:0o700});
  const data=JSON.stringify(record);if(Buffer.byteLength(data)>maxBytes)throw new Error('Recovery checkpoint exceeds the storage budget. Analysis stopped to protect saved progress.');
  const target=file(record.id),temporary=`${target}.${randomUUID()}.tmp`;let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(data);await handle.sync();await handle.close();handle=null;await rename(temporary,target);
   const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
  }finally{if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
 }
 async function get(id,ownerId){
  const record=JSON.parse(await readFile(file(id),'utf8'));
  if(record.ownerId!==ownerId)throw new Error('Recovery record not found.');
  if(record.state==='running'&&!active.has(id))return {...record,state:'interrupted',notice:'The previous server process ended. In-flight provider work may have been billed; completed checkpoints are retained.'};
  return record;
 }
 async function list(ownerId,caseId){
  const names=await readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const out=[];
  for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
   const record=JSON.parse(await readFile(path.join(directory,name),'utf8'));
   if(record.ownerId===ownerId&&(!caseId||record.caseId===caseId))out.push({id:record.id,ownerId:record.ownerId,caseId:record.caseId,state:record.state==='running'&&!active.has(record.id)?'interrupted':record.state,updatedAt:record.updatedAt,provenance:record.provenance,result:record.result?{analysis:{status:record.result.analysis?.status,completed:record.result.analysis?.completed,planned:record.result.analysis?.planned}}:null});
  }
  return out.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 }
 return {get,list,isActive:id=>active.has(id),activate:id=>active.add(id),deactivate:id=>active.delete(id),
  async create({ownerId,caseId,texts,documents,originalDocuments,planId,provenance}){
   if((await list(ownerId)).length>=maxJobsPerOwner)throw new Error('Recovery storage is full. Export and remove an old recovery record before starting another analysis.');
   const record={id:randomUUID(),ownerId,caseId,texts,documents,originalDocuments,planId,provenance,state:'running',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:null};await write(record);return record;
  },
  async checkpoint(record,result,state='running'){
   const next={...record,result,state,updatedAt:new Date().toISOString()};await write(next);return next;
  },
  async remove(id,ownerId){if(active.has(id))throw new Error('Cancel the active analysis before deleting its recovery copy.');await get(id,ownerId);await unlink(file(id));}
 };
}
