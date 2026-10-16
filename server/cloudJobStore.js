import {createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createCloudStoreFactory({url,key,signingKey}){
 return req=>{
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1],owner=req.identity?.id;
  if(!token||!uuid.test(owner??''))throw new Error('Sign in to save hosted analysis.');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}});
  return cloudObjectStore(client,owner,{signingKey});
 };
}
export function cloudObjectStore(client,owner,{signingKey}={}){
 if(!signingKey)throw new Error('Private checkpoint signing is not configured.');
 const sign=(objectPath,text)=>createHmac('sha256',signingKey).update('deposition-job-v1\\0'+objectPath+'\\0'+text).digest('hex');
 const bucket=client.storage.from('case-originals');
 const prefix=(caseId,jobId)=>{if(!uuid.test(caseId??'')||!uuid.test(jobId??''))throw new Error('Invalid saved case or job identifier.');return `${owner}/${caseId}/cloud-${jobId}-`;};
 const api={
  async latest(caseId,jobId){
   const root=prefix(caseId,jobId),folder=root.slice(0,root.lastIndexOf('/'));let files=[];
   for(let offset=0;;offset+=1000){const {data,error}=await bucket.list(folder,{search:`cloud-${jobId}-s`,limit:1000,offset});if(error)throw new Error('Private checkpoint listing failed.');files.push(...(data??[]));if(!data||data.length<1000)break;}
   const sequence=files.map(f=>f.name.match(/-s(\d+)-result\.txt$/)?.[1]).filter(Boolean).map(Number).sort((a,b)=>b-a)[0];
   if(sequence===undefined)return {latest:null,sequence:0,spent:0};
   const record=await api.get(caseId,jobId,`s${sequence}-result`);if(!record)throw new Error('Checkpoint listing changed; inspect saved progress.');
   return {latest:record.result,sequence:sequence+1,spent:record.totalSpentUsd};
  },
  async authorize(caseId){const {data,error}=await client.from('cases').select('id,owner_id').eq('id',caseId).eq('owner_id',owner).single();if(error||!data)throw new Error('Saved case not found or unavailable.');},
  async get(caseId,jobId,name){const {data,error}=await bucket.download(prefix(caseId,jobId)+name+'.txt');if(error){if(Number(error.statusCode??error.status)===404||/not found|does not exist/i.test(error.message))return null;throw new Error('Private job storage could not be read.');}const envelope=JSON.parse(await data.text()),text=JSON.stringify(envelope.payload),expected=sign(prefix(caseId,jobId)+name+'.txt',text);if(typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||!timingSafeEqual(Buffer.from(envelope.signature),Buffer.from(expected)))throw new Error('Private checkpoint signature failed. No paid work was started.');return envelope.payload;},
  async put(caseId,jobId,name,value){const payload=JSON.stringify(value),text=JSON.stringify({payload:value,signature:sign(prefix(caseId,jobId)+name+'.txt',payload)});if(Buffer.byteLength(text)>32*1024*1024)throw new Error('Checkpoint exceeds the private storage limit; no additional model work started.');const {error}=await bucket.upload(prefix(caseId,jobId)+name+'.txt',text,{contentType:'text/plain',upsert:false});if(error){if(Number(error.statusCode??error.status)===409||/already exists|duplicate/i.test(error.message))return false;throw new Error('Private checkpoint could not be saved. No automatic retry will start.');}return true;}
 };return api;
}
