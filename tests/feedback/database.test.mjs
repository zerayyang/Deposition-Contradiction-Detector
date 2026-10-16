import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {activeFeedbackExamples} from '../../src/lib/feedbackStore.js';
const owner='10000000-0000-0000-0000-000000000001',reviewer='10000000-0000-0000-0000-000000000002',stranger='10000000-0000-0000-0000-000000000003',caseId='20000000-0000-0000-0000-000000000001';
const finding={type:'DIRECT',claim1:{original:'I signed the form.'},claim2:{original:'I did not sign the form.'},reasoning:'Fictional scripted output, not a live result.',score:null,humanConfidence:null};
let sequence=0;const requestId=()=>`30000000-0000-0000-0000-${String(++sequence).padStart(12,'0')}`;

test('Stage 6 migration and authorization execute in in-memory PostgreSQL',async t=>{
 const db=new PGlite();
 try{
 await db.exec(`create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon;
 create table public.cases(id uuid primary key,owner_id uuid not null references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb);
 alter table public.cases enable row level security;
 grant select,update,delete on public.cases to authenticated;
 create policy own_cases on public.cases to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());`);
 for(const id of [owner,reviewer,stranger])await db.query('insert into auth.users values($1)',[id]);
 await db.query('insert into public.cases values($1,$2,$3,$4,$5,$6)',[caseId,owner,'Fictional case','Q: Did you sign?\nA: I signed the form.','Q: Did you sign?\nA: I did not sign the form.',JSON.stringify({findings:[finding],analysis:{provenance:{pipeline:'fictional-test'}}})]);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261015_feedback_approvals.sql',import.meta.url),'utf8'));
 async function as(id,operation,role='authenticated'){
  await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
  try{return await operation();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 const submit=(id=requestId(),type='FALSE_POSITIVE',extra={})=>db.query('select public.submit_finding_feedback($1,$2,$3,$4,$5,$6,$7) id',[caseId,0,JSON.stringify(extra.finding??finding),type,extra.rationale??'Scripted correction requiring independent source review.',id,extra.supersedesId??null]).then(r=>r.rows[0].id);
 const decide=(feedbackId,decision='APPROVE',expected=null,checked=true)=>db.query('select public.review_finding_feedback($1,$2,$3,$4,$5) id',[feedbackId,decision,'Independent scripted review, not an approved real-world label.',checked,expected]).then(r=>r.rows[0].id);
 let proposal,approval,revocation,second;
 await t.test('owner submits from a saved finding; snapshot copies source hashes and provenance',async()=>{
  proposal=await as(owner,()=>submit());const rows=await as(owner,()=>db.query('select * from public.finding_feedback'));
  assert.equal(rows.rows.length,1);assert.deepEqual(rows.rows[0].original_snapshot.finding,finding);assert.equal(rows.rows[0].original_snapshot.transcript1_sha256.length,64);assert.equal(rows.rows[0].submitted_by,owner);
  const decisions=await as(owner,()=>db.query('select * from public.feedback_decisions'));assert.equal(decisions.rows.length,0);
 });
 await t.test('ordinary and anonymous users cannot see or submit another owner’s records',async()=>{
  assert.equal((await as(stranger,()=>db.query('select * from public.finding_feedback'))).rows.length,0);
  await assert.rejects(()=>as(stranger,()=>submit()),/Case not found/);
  await assert.rejects(()=>as(null,()=>submit(),'anon'),/permission denied/);
  await assert.rejects(()=>as(null,()=>submit()),/Sign in/);
  await assert.rejects(()=>as(stranger,()=>db.query('select * from feedback_private.reviewer_assignments')),/permission denied/);
 });
 await t.test('clients cannot insert, edit, delete or forge approvals directly',async()=>{
  for(const table of ['finding_feedback','feedback_decisions','approved_feedback_examples']){
   await assert.rejects(()=>as(owner,()=>db.query(`delete from public.${table}`)),/permission denied/);
   await assert.rejects(()=>as(owner,()=>db.query(`update public.${table} set owner_id=$1`,[stranger])),/permission denied/);
  }
  await assert.rejects(()=>as(owner,()=>db.query('insert into public.feedback_decisions default values')),/permission denied/);
  await assert.rejects(()=>as(owner,()=>db.query('insert into feedback_private.reviewer_assignments values($1,$2,now())',[owner,owner])),/permission denied/);
  await assert.rejects(()=>db.query('insert into feedback_private.reviewer_assignments values($1,$2,now())',[owner,owner]),/check constraint/);
 });
 await t.test('repeated submissions never count as approval and request retries are idempotent',async()=>{
  const id=requestId(),a=await as(owner,()=>submit(id)),b=await as(owner,()=>submit(id));assert.equal(a,b);
  await assert.rejects(()=>as(owner,()=>submit(id,'INFERENTIAL')),/different submission/);
  for(let n=0;n<3;n++)await as(owner,()=>submit());
  assert.equal((await db.query('select count(*) n from public.approved_feedback_examples')).rows[0].n,0);
 });
 await t.test('owner cannot approve; unassigned reviewers are denied',async()=>{
  await assert.rejects(()=>as(owner,()=>decide(proposal)),/separately authorized|review denied/);
  await assert.rejects(()=>as(reviewer,()=>decide(proposal)),/separately authorized|review denied/);
  await db.query('insert into feedback_private.reviewer_assignments(owner_id,reviewer_id) values($1,$2)',[owner,reviewer]);
  assert.equal((await as(reviewer,()=>db.query('select public.can_review_finding_feedback($1) ok',[owner]))).rows[0].ok,true);
  assert.ok((await as(reviewer,()=>db.query('select * from public.finding_feedback'))).rows.length>0);
 });
 await t.test('explicit source review and current-decision token are required for approval',async()=>{
  await assert.rejects(()=>as(reviewer,()=>decide(proposal,'APPROVE',null,false)),/source review/);
  approval=await as(reviewer,()=>decide(proposal));
  await assert.rejects(()=>as(reviewer,()=>decide(proposal)),/Review changed/);
  assert.equal((await db.query('select count(*) n from public.approved_feedback_examples')).rows[0].n,1);
  const rows=(await db.query('select * from public.approved_feedback_examples')).rows,decisions=(await db.query('select * from public.feedback_decisions')).rows;
  assert.equal(activeFeedbackExamples(rows,decisions,{historyComplete:true}).length,1);
  await assert.rejects(()=>db.query('insert into feedback_private.active_approvals select * from feedback_private.active_approvals'),/duplicate key/);
 });
 await t.test('conflicting corrections cannot both be approved on one target',async()=>{
  second=await as(owner,()=>submit(requestId(),'INFERENTIAL'));
  await assert.rejects(()=>as(reviewer,()=>decide(second)),/Another correction/);
  assert.equal((await db.query('select count(*) n from public.feedback_decisions where feedback_id=$1',[second])).rows[0].n,0);
 });
 await t.test('revocation appends history and allows an explicitly reviewed replacement',async()=>{
  await assert.rejects(()=>as(reviewer,()=>decide(proposal,'REJECT',approval)),/Revoke/);
  revocation=await as(reviewer,()=>decide(proposal,'REVOKE',approval));assert.notEqual(revocation,approval);
  const historical=(await db.query('select * from public.approved_feedback_examples')).rows;
  assert.equal(historical.length,1);assert.equal(activeFeedbackExamples(historical,(await db.query('select * from public.feedback_decisions')).rows,{historyComplete:true}).length,0);
  await as(reviewer,()=>decide(second));assert.equal((await db.query('select count(*) n from public.approved_feedback_examples')).rows[0].n,2);
 });
 await t.test('new revisions preserve the original proposal and stale finding indices are refused',async()=>{
  const revised=await as(owner,()=>submit(requestId(),'DIRECT',{supersedesId:proposal}));assert.notEqual(revised,proposal);
  assert.equal((await db.query('select proposed_type from public.finding_feedback where id=$1',[proposal])).rows[0].proposed_type,'FALSE_POSITIVE');
  await assert.rejects(()=>as(owner,()=>submit(requestId(),'DIRECT',{finding:{...finding,type:'INFERENTIAL'}})),/Saved finding changed/);
 });
 await t.test('later case edits never rewrite the captured result or numeric score',async()=>{
  await as(owner,()=>db.query('update public.cases set results=$1 where id=$2',[JSON.stringify({findings:[{...finding,reasoning:'Changed saved result.'}]}),caseId]));
  const snapshot=(await db.query('select original_snapshot from public.finding_feedback where id=$1',[proposal])).rows[0].original_snapshot;
  assert.deepEqual(snapshot.finding,finding);assert.equal(snapshot.finding.score,null);
 });
 await t.test('revoked reviewer membership immediately removes access and decision rights',async()=>{
  await db.query('delete from feedback_private.reviewer_assignments where reviewer_id=$1',[reviewer]);
  assert.equal((await as(reviewer,()=>db.query('select * from public.finding_feedback'))).rows.length,0);
  await assert.rejects(()=>as(reviewer,()=>decide(proposal,'APPROVE',revocation)),/separately authorized|review denied/);
 });
 await t.test('case deletion removes its private feedback, decisions and example history',async()=>{
  await as(owner,()=>db.query('delete from public.cases where id=$1',[caseId]));
  assert.equal((await db.query('select count(*) n from feedback_private.active_approvals')).rows[0].n,0);
  for(const table of ['finding_feedback','feedback_decisions','approved_feedback_examples'])assert.equal((await db.query(`select count(*) n from public.${table}`)).rows[0].n,0);
 });
 }finally{await db.close();}
});
