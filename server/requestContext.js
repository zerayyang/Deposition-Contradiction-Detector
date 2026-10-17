import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';

// Carries one request ID through every log line a request produces, including model
// calls made deep inside the analysis engines. Holds identifiers only, never content.
const storage=new AsyncLocalStorage();
const safeId=/^[A-Za-z0-9._-]{8,64}$/;

export function requestIdFrom(header){return typeof header==='string'&&safeId.test(header)?header:randomUUID();}
export function runWithRequest(requestId,fn){return storage.run({requestId},fn);}
export function currentRequestId(){return storage.getStore()?.requestId??null;}
// Adds the active request ID to a log event unless the event already names one.
export function withRequestContext(event){const requestId=currentRequestId();return requestId&&event.requestId===undefined?{...event,requestId}:event;}
