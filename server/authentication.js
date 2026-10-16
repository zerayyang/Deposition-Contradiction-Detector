import {createClient} from '@supabase/supabase-js';
export function createAuthentication({url,key,allowLocal=false,allowedUserIds=null}={}) {
 const client=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)})}}):null;
 if(!client&&!allowLocal)throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before exposing this server.');
 return async req=>{
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  if(allowLocal&&loopback&&!req.headers.authorization)return {id:'local-development'};
  if(!client){if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))throw new Error('Local access only.');return {id:'local-development'};}
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];if(!token)throw new Error('Sign in before using analysis.');
  const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw new Error('Your session expired. Sign in again.');if(allowedUserIds&&!allowedUserIds.includes(data.user.id))throw new Error('This account is not enabled for the private demo.');return {id:data.user.id};
 };
}
