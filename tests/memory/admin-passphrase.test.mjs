import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Fictional accounts and a test-only passphrase.
const owner='10000000-0000-0000-0000-000000000001',admin='10000000-0000-0000-0000-000000000002',guesser='10000000-0000-0000-0000-000000000003';
const PHRASE='test-only-passphrase';
test('admin passphrase migration: unlock, limits, and review rights in PostgreSQL',async t=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.cases(id uuid primary key,owner_id uuid references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb);`);
 for(const id of [owner,admin,guesser])await db.query('insert into auth.users values($1)',[id]);
 for(const name of ['20261015_feedback_approvals.sql','202610160001_approved_memory.sql','202610190001_admin_passphrase.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 async function as(id,fn,role='authenticated'){await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);try{return await fn();}finally{await db.exec('reset role');}}
 const value=async(sql,args=[])=>{const r=await db.query(sql,args);return Object.values(r.rows[0]??{})[0];};
 const unlock=(id,phrase)=>as(id,()=>value('select public.become_feedback_admin($1)',[phrase]));
 const canReview=(id,ownerId)=>as(id,()=>value('select public.can_review_finding_feedback($1)',[ownerId]));

 await t.test('nothing unlocks before the passphrase is set, and the app cannot set it',async()=>{
  await assert.rejects(()=>unlock(admin,PHRASE),/not been set up/);
  await assert.rejects(()=>as(admin,()=>value('select feedback_private.set_admin_passphrase($1)',[PHRASE])),/permission denied/);
  await value('select feedback_private.set_admin_passphrase($1)',[PHRASE]);
  assert.ok(!JSON.stringify((await db.query('select * from feedback_private.admin_passphrase')).rows).includes(PHRASE),'Only a hash is stored');
 });
 await t.test('the right passphrase makes an admin who can review others but not themselves',async()=>{
  assert.equal(await as(admin,()=>value('select public.is_feedback_admin()')),false);
  assert.equal(await canReview(admin,owner),false);
  assert.equal(await unlock(admin,PHRASE),true);
  assert.equal(await as(admin,()=>value('select public.is_feedback_admin()')),true);
  assert.equal(await canReview(admin,owner),true);assert.equal(await canReview(admin,admin),false);
  assert.equal(await canReview(owner,admin),false,'Ordinary users gain nothing');
 });
 await t.test('wrong guesses return false and stop after five per hour',async()=>{
  for(let i=0;i<5;i++)assert.equal(await unlock(guesser,'wrong guess '+i),false);
  await assert.rejects(()=>unlock(guesser,PHRASE),/Too many/);
  assert.equal(await as(guesser,()=>value('select public.is_feedback_admin()')),false);
  await assert.rejects(()=>unlock(null,PHRASE,'anon'),/permission denied|Sign in/,'Signed-out visitors cannot unlock');
 });
 }finally{await db.close();}
});
