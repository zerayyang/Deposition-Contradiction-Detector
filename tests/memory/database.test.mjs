import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-0000-0000-000000000001',reviewer='10000000-0000-0000-0000-000000000002',stranger='10000000-0000-0000-0000-000000000003';
const source='20000000-0000-0000-0000-000000000001',target='20000000-0000-0000-0000-000000000002';
const finding={type:'DIRECT',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'}};
test('approved-memory migration executes owner isolation, release and revocation in PostgreSQL',async t=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.cases(id uuid primary key,owner_id uuid references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb);
 alter table public.cases enable row level security;grant select,update,delete on public.cases to authenticated;
 create policy own_case on public.cases to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());`);
 for(const id of [owner,reviewer,stranger])await db.query('insert into auth.users values($1)',[id]);
 for(const id of [source,target])await db.query('insert into public.cases values($1,$2,$3,$4,$5,$6)',[id,owner,'Fictional only',id===source?'A: I signed.':'A: Another occasion.',id===source?'A: I did not sign.':'A: Different occasion.',JSON.stringify({findings:[finding]})]);
 for(const name of ['20261015_feedback_approvals.sql','202610160001_approved_memory.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 async function as(id,fn,role='authenticated'){await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);try{return await fn();}finally{await db.exec('reset role');}}
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return Object.values(r.rows[0]??{})[0];};
 const read=(caseId=target,hashes=[])=>query('select public.get_approved_feedback_memory($1,$2)',[caseId,hashes]);
 let feedback,decision,example;
 const release=(enabled=true,declared=true)=>query('select public.release_feedback_memory($1,$2,$3,$4,$5)',[example,enabled,'Check the same occasion before comparing a denial with an affirmation.',['signed'],declared]);
 await t.test('ordinary approval alone is not memory; owner and unassigned reviewers cannot release',async()=>{
  feedback=await as(owner,()=>query('select public.submit_finding_feedback($1,0,$2,$3,$4,$5)',[source,JSON.stringify(finding),'DIRECT','Scripted proposal requiring independent checking.','30000000-0000-0000-0000-000000000001']));
  await db.query('insert into feedback_private.reviewer_assignments values($1,$2,now())',[owner,reviewer]);
  decision=await as(reviewer,()=>query('select public.review_finding_feedback($1,$2,$3,true,null)',[feedback,'APPROVE','Independently checked fictional source statements.']));
  example=await query('select id from public.approved_feedback_examples');assert.deepEqual(await as(owner,()=>read()),[]);
  await assert.rejects(()=>as(owner,()=>release()),/independently/);await assert.rejects(()=>as(stranger,()=>release()),/independently/);
  await assert.rejects(()=>as(reviewer,()=>release(true,false)),/non-evaluation/);
 });
 await t.test('released lessons are owner-private, contain no testimony, and cannot retrieve the current case',async()=>{
  await as(reviewer,()=>release());const rows=await as(owner,()=>read());assert.equal(rows.length,1);assert.equal(rows[0].id,example);
  assert.ok(!JSON.stringify(rows).includes('I did not sign.'));assert.ok(!JSON.stringify(rows).includes('owner_id'));
  assert.deepEqual(await as(owner,()=>read(source)),[]);await assert.rejects(()=>as(stranger,()=>read()),/owned case/);await assert.rejects(()=>as(reviewer,()=>read()),/owned case/);
  await assert.rejects(()=>as(null,()=>read(),'anon'),/permission denied/);
  assert.equal((await as(stranger,()=>db.query('select * from public.feedback_memory_releases'))).rows.length,0);
  await assert.rejects(()=>as(owner,()=>db.query('delete from public.feedback_memory_releases')),/permission denied/);
 });
 await t.test('same source hashes, changed sources and disabled releases exclude lessons',async()=>{
  const hash=await query("select original_snapshot->>'transcript1_sha256' from public.finding_feedback");assert.deepEqual(await as(owner,()=>read(target,[hash])),[]);
  await as(owner,()=>db.query('update public.cases set transcript1=$1 where id=$2',['A: Edited testimony.',source]));assert.deepEqual(await as(owner,()=>read()),[]);
  await as(owner,()=>db.query('update public.cases set transcript1=$1 where id=$2',['A: I signed.',source]));assert.equal((await as(owner,()=>read())).length,1);
  await as(reviewer,()=>release(false));assert.deepEqual(await as(owner,()=>read()),[]);await as(reviewer,()=>release(true));assert.equal((await as(owner,()=>read())).length,1);
 });
 await t.test('feedback revocation immediately excludes a historically released lesson',async()=>{
  await as(reviewer,()=>query('select public.review_finding_feedback($1,$2,$3,false,$4)',[feedback,'REVOKE','Withdraw this fictional approval for further review.',decision]));
  assert.deepEqual(await as(owner,()=>read()),[]);assert.equal((await as(owner,()=>db.query('select * from public.feedback_memory_releases'))).rows.length,3);
  await assert.rejects(()=>as(reviewer,()=>release()),/current source-checked/);
 });
 }finally{await db.close();}
});
