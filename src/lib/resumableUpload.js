const CHUNK=6*1024*1024;
// Minimal TUS upload: authenticated, fixed-size PATCHes, explicit offsets within
// this import only. No background upload, cross-account cache, or overwrite.
export async function uploadResumable(client,path,file,type,{signal,onProgress=()=>{},fetchImpl=fetch}={}) {
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  const token=data?.session?.access_token;
  if(!token)throw new Error('Sign in again before uploading.');
  const base=client.storage.url;
  if(typeof base!=='string')throw new Error('Storage URL is unavailable.');
  const endpoint=new URL(base.replace(/\/$/,'')+'/upload/resumable');
  if(endpoint.hostname.endsWith('.supabase.co')&&!endpoint.hostname.endsWith('.storage.supabase.co')) endpoint.hostname=endpoint.hostname.replace('.supabase.co','.storage.supabase.co');
  const headers={'Tus-Resumable':'1.0.0',Authorization:`Bearer ${token}`,'x-upsert':'false'};
  const metadata={bucketName:'case-originals',objectName:path,contentType:type,cacheControl:'3600'};
  const encode=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const created=await fetchImpl(endpoint,{method:'POST',signal,headers:{...headers,'Upload-Length':String(file.size),'Upload-Metadata':Object.entries(metadata).map(([k,v])=>`${k} ${encode(v)}`).join(',')}});
  if(!created.ok)throw new Error(`Storage refused upload (${created.status}). Check the private bucket migration and global file limit.`);
  const location=created.headers.get('Location');
  if(!location)throw new Error('Storage did not return a resumable upload URL.');
  const url=new URL(location,endpoint);
  if(url.origin!==endpoint.origin||!url.pathname.startsWith(endpoint.pathname+'/'))throw new Error('Storage returned an unexpected upload URL.');
  let offset=0;
  while(offset<file.size) {
    signal?.throwIfAborted();
    let response;
    try {response=await fetchImpl(url,{method:'PATCH',signal,headers:{...headers,'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:file.slice(offset,offset+CHUNK)});}
    catch(e) {signal?.throwIfAborted();throw new Error(`Original upload interrupted at ${offset}/${file.size} bytes. Previous case contents remain unchanged. Retry the import.`,{cause:e});}
    if(!response.ok)throw new Error(`Original upload stopped at ${offset}/${file.size} bytes (HTTP ${response.status}). Retry the import.`);
    const next=Number(response.headers.get('Upload-Offset'));
    if(!Number.isInteger(next)||next!==Math.min(offset+CHUNK,file.size))throw new Error('Storage returned an invalid upload offset; import was not committed.');
    offset=next;onProgress(`Uploading original: ${Math.round(100*offset/file.size)}%`);
  }
}
