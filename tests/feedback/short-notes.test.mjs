import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createFeedbackStore} from '../../src/lib/feedbackStore.js';
import {createPracticeStore} from '../../src/lib/practiceStore.js';
import {selectApprovedMemory} from '../../server/memory/approvedMemory.js';
const owner='10000000-0000-0000-0000-000000000001',admin='10000000-0000-0000-0000-000000000002',outsider='10000000-0000-0000-0000-000000000003',caseId='20000000-0000-0000-0000-000000000001';
const finding={type:'DIRECT',claim1:{original:'Synthetic answer one.'},claim2:{original:'Synthetic answer two.'}};

test('short nonblank correction, review and lesson pass client/practice; blanks and source bypass fail',async()=>{
 const calls=[],store=createFeedbackStore({from(){},async rpc(name,args){calls.push({name,args});return {data:caseId};}});
 await store.submit({caseId,findingIndex:0,finding,proposedType:'FALSE_POSITIVE',rationale:'No',requestId:caseId});
 await store.review({feedbackId:caseId,decision:'APPROVE',rationale:'OK',sourceChecked:true,expectedDecisionId:null});
 await store.releaseMemory({exampleId:caseId,enabled:true,lesson:'Dates',searchTerms:['date'],notEvaluationMaterial:true});
 assert.equal(calls.length,3);
 await assert.rejects(()=>store.review({feedbackId:caseId,decision:'APPROVE',rationale:'OK',sourceChecked:false,expectedDecisionId:null}));
 for(const rationale of ['', '   ', 'x'.repeat(4001)])await assert.rejects(()=>store.review({feedbackId:caseId,decision:'REJECT',rationale,sourceChecked:false,expectedDecisionId:null}));
 const practice=createPracticeStore();
 await practice.review({decision:'APPROVE',rationale:'OK',sourceChecked:true,expectedDecisionId:null});
 await practice.releaseMemory({enabled:true,lesson:'Dates',searchTerms:['date'],notEvaluationMaterial:true});
 assert.equal((await practice.reviewState()).release.lesson,'Dates');
 assert.equal(selectApprovedMemory([{id:owner,decision_id:admin,release_id:caseId,corrected_type:'FALSE_POSITIVE',lesson:'Dates',search_terms:['date']}],['date','']).examples.length,1);
 const ui=await readFile(new URL('../../src/FeedbackReview.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/minLength=\{10\}|length<10|at least 10 characters/);
});

test('upgrade accepts short notes in PostgreSQL while preserving admin, source and private-memory boundaries',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.cases(id uuid primary key,owner_id uuid references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb);`);
 for(const id of [owner,admin,outsider])await db.query('insert into auth.users values($1)',[id]);
 await db.query('insert into public.cases values($1,$2,$3,$4,$5,$6)',[caseId,owner,'Synthetic case','Q: Example?\nA: Synthetic answer one.','Q: Example?\nA: Synthetic answer two.',JSON.stringify({findings:[finding]})]);
 for(const name of ['20261015_feedback_approvals.sql','202610160001_approved_memory.sql','202610160002_feedback_review_sources.sql','202610190001_admin_passphrase.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 const execute=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 const as=async(id,fn)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.exec('reset role');}};
 const submit=(note='No')=>execute('select public.submit_finding_feedback($1,0,$2,$3,$4,gen_random_uuid())',[caseId,JSON.stringify(finding),'FALSE_POSITIVE',note]);
 await assert.rejects(()=>as(owner,()=>submit()),/Invalid feedback/);
 const migration=await readFile(new URL('../../supabase/migrations/202610190003_short_feedback_notes.sql',import.meta.url),'utf8');
 await db.exec(migration);
 // Reapplying cannot erase history or alter grants.
 await db.exec(migration);
 await db.query('insert into feedback_private.admins(user_id) values($1)',[admin]);
 const proposal=await as(owner,()=>submit());
 for(const note of ['', '   ', 'x'.repeat(4001)])await assert.rejects(()=>as(owner,()=>submit(note)),/Invalid feedback/);
 const decide=(id,checked=true,note='OK')=>as(id,()=>execute('select public.review_finding_feedback($1,$2,$3,$4,null)',[proposal,'APPROVE',note,checked]));
 await assert.rejects(()=>decide(owner),/separately authorized|review denied/);
 await assert.rejects(()=>decide(outsider),/separately authorized|review denied/);
 await assert.rejects(()=>decide(admin,false),/source review/);
 await assert.rejects(()=>decide(admin,true,' '),/Invalid review/);
 await decide(admin);
 const example=await execute('select id from public.approved_feedback_examples where feedback_id=$1',[proposal]);
 const release=(lesson,attested=true)=>as(admin,()=>execute('select public.release_feedback_memory($1,true,$2,$3,$4)',[example,lesson,['date'],attested]));
 await release('Dates');
 await assert.rejects(()=>release(' '),/reusable lesson/);
 await assert.rejects(()=>release('Dates',false),/reusable lesson/);
 assert.equal(await execute('select lesson from public.feedback_memory_releases where example_id=$1',[example]),'Dates');
 await db.query('update public.cases set transcript1=$1 where id=$2',['Synthetic changed source.',caseId]);
 const stale=await as(owner,()=>execute('select public.submit_finding_feedback($1,0,$2,$3,$4,gen_random_uuid())',[caseId,JSON.stringify(finding),'DIRECT','OK'])).then(()=>false,()=>true);
 assert.equal(stale,true);
 }finally{await db.close();}
});
