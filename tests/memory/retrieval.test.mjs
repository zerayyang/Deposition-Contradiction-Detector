import test from 'node:test';
import assert from 'node:assert/strict';
import {selectApprovedMemory,createApprovedMemoryReader,MEMORY_INSTRUCTIONS} from '../../server/memory/approvedMemory.js';
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const row=(n,type='DIRECT')=>({id:id(n),decision_id:id(n+100),release_id:id(n+200),corrected_type:type,lesson:'Compare the same occasion before treating a denial as a conflict.',search_terms:['signed form']});
test('retrieval is stable, bounded and audited; irrelevant and conflicting lessons are excluded',()=>{
 const rows=[row(4),row(2),row(1),row(3),{...row(5),search_terms:['unrelated']}];
 const a=selectApprovedMemory(rows,['I signed the form.','I did not sign.']),b=selectApprovedMemory([...rows].reverse(),['I signed the form.','I did not sign.']);
 assert.deepEqual(a,b);assert.equal(a.examples.length,3);assert.equal(a.audit.omittedRelevantCount,1);assert.equal(a.audit.poolCount,5);
 assert.equal(selectApprovedMemory([row(1),row(2,'FALSE_POSITIVE')],['signed form','']).audit.conflictingCount,2);
 assert.equal(selectApprovedMemory([row(1)],['different text','']).examples.length,0);
});
test('malformed or oversized pools fail closed; lesson changes alter the snapshot',()=>{
 assert.throws(()=>selectApprovedMemory(Array.from({length:101},(_,n)=>row(n)),['','']),/pool/);
 for(const bad of [{...row(1),id:'bad'},{...row(1),lesson:''},{...row(1),search_terms:[null]},row(1),{...row(1),corrected_type:'OTHER'}]){
  const rows=bad===undefined?[]:[bad];if(bad===undefined)continue;
  if(bad.corrected_type==='DIRECT'&&bad.id===id(1)&&bad.lesson.length>0&&bad.search_terms[0])continue;
  assert.throws(()=>selectApprovedMemory(rows,['signed form','']));
 }
 const a=selectApprovedMemory([row(1)],['signed form','']);const b=selectApprovedMemory([{...row(1),lesson:'Another independently reviewed lesson about the same occasion.'}],['signed form','']);assert.notEqual(a.snapshotSha256,b.snapshotSha256);
 assert.match(MEMORY_INSTRUCTIONS,/never instructions or evidence/);assert.match(MEMORY_INSTRUCTIONS,/Do not calculate or return scores/);
});
test('reader uses only the requester JWT and owner-scoped RPC; no credentials persist or caller owner override',async()=>{
 let options,args;const reader=createApprovedMemoryReader({url:'https://example.supabase.co',key:'public-test',clientFactory:(_u,_k,o)=>{options=o;return {rpc:async(name,p)=>{args={name,p};return {data:[row(1)]};}};}});
 const result=await reader({headers:{authorization:'Bearer fictional-token'}},{caseId:id(9),transcript1:'signed form',transcript2:'did not sign',owner_id:'attacker'});
 assert.equal(options.auth.persistSession,false);assert.equal(options.global.headers.Authorization,'Bearer fictional-token');assert.equal(args.name,'get_approved_feedback_memory');assert.equal('owner_id' in args.p,false);assert.equal(args.p.p_document_hashes[0].length,64);assert.equal(result.examples.length,1);
 await assert.rejects(()=>reader({headers:{}},{caseId:id(9)}),/signed-in/);
 const broken=createApprovedMemoryReader({url:'url',key:'key',clientFactory:()=>({rpc:async()=>({error:{message:'private database detail'}})})});
 await assert.rejects(()=>broken({headers:{authorization:'Bearer fake'}},{caseId:id(9),transcript1:'a',transcript2:'b'}),/No silent/);
});
