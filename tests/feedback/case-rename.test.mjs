import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Reproduces the live setup (update allowed on content columns only), then applies the rename migration.
const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',caseId='20000000-0000-0000-0000-000000000001';
test('rename migration lets owners rename their own cases only',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table public.cases(id uuid primary key,owner_id uuid references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb,review_notes jsonb);
 alter table public.cases enable row level security;grant select on public.cases to authenticated;
 grant update (transcript1,transcript2,results,review_notes) on public.cases to authenticated;
 create policy own on public.cases to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());`);
 for(const id of [owner,other])await db.query('insert into auth.users values($1)',[id]);
 await db.query('insert into public.cases(id,owner_id,title) values($1,$2,$3)',[caseId,owner,'Old name']);
 const as=async(id,sql,args)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const rename=(id,title)=>as(id,'update public.cases set title=$1 where id=$2 returning id',[title,caseId]);
 await assert.rejects(()=>rename(owner,'New name'),/permission denied/,'Reproduces the live error');
 await db.exec(await readFile(new URL('../../supabase/migrations/202610190002_case_rename.sql',import.meta.url),'utf8'));
 assert.equal((await rename(owner,'New name')).rows.length,1);
 assert.equal((await rename(other,'Hijacked')).rows.length,0,'Other users cannot rename it');
 assert.equal((await db.query('select title from public.cases')).rows[0].title,'New name');
 }finally{await db.close();}
});
