import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFeedbackStore} from '../../src/lib/feedbackStore.js';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-0000-0000-000000000001',reviewer='10000000-0000-0000-0000-000000000002',stranger='10000000-0000-0000-0000-000000000003',caseId='20000000-0000-0000-0000-000000000001';
const finding={type:'DIRECT',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'}};
test('lesson release is explicit, independently authorized by RPC, and rejects scores or evaluation material',async()=>{
 const calls=[],store=createFeedbackStore({from(){},async rpc(name,args){calls.push({name,args});return {data:caseId};}});
 const input={exampleId:caseId,enabled:true,lesson:'Check the same occasion before comparing claims.',searchTerms:['signed form'],notEvaluationMaterial:true};
 for(const extra of [{score:99},{notEvaluationMaterial:false},{searchTerms:['??']},{searchTerms:[]},{lesson:'   '}])await assert.rejects(()=>store.releaseMemory({...input,...extra}));
 assert.equal(calls.length,0);await store.releaseMemory(input);assert.equal(calls[0].name,'release_feedback_memory');assert.equal(calls[0].args.p_enabled,true);
 await store.releaseMemory({...input,enabled:false});assert.equal(calls[1].args.p_enabled,false);assert.equal('owner_id' in calls[0].args,false);
});
test('inbox exposes pagination and reads latest revisions instead of an incomplete oldest-history page',async()=>{
 const calls=[],data={finding_feedback:[{id:'one'},{id:'two'},{id:'more'}],feedback_decisions:[{id:reviewer,decision:'APPROVE'}],approved_feedback_examples:[{id:caseId}],feedback_memory_releases:[{revision:70,enabled:false}]};
 const client={rpc:async()=>({data:{sourcesUnchanged:true}}),from(table){const q={select(){return q;},eq(k,v){calls.push([table,'eq',k,v]);return q;},order(k,v){calls.push([table,'order',k,v]);return q;},async range(){return {data:data[table]};},async limit(){return {data:data[table]};}};return q;}};
 const store=createFeedbackStore(client),page=await store.listInbox({limit:2});assert.equal(page.rows.length,2);assert.equal(page.nextOffset,2);
 const state=await store.reviewState(owner);assert.equal(state.release.enabled,false);assert.ok(calls.some(([table,op,key,value])=>table==='feedback_memory_releases'&&op==='order'&&key==='revision'&&value.ascending===false));
 assert.deepEqual(await store.reviewSources(owner),{sourcesUnchanged:true});
});
test('source-review migration only exposes the selected feedback to its owner or assigned reviewer',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;
 create table public.cases(id uuid primary key,owner_id uuid references auth.users(id),title text,transcript1 text,transcript2 text,results jsonb);
 alter table public.cases enable row level security;grant select,update on public.cases to authenticated;create policy own on public.cases to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());`);
 for(const id of [owner,reviewer,stranger])await db.query('insert into auth.users values($1)',[id]);
 await db.query('insert into public.cases values($1,$2,$3,$4,$5,$6)',[caseId,owner,'Fictional sources','Q: Did you sign?\nA: I signed.','Q: Did you sign?\nA: I did not sign.',JSON.stringify({findings:[finding]})]);
 for(const name of ['20261015_feedback_approvals.sql','202610160001_approved_memory.sql','202610160002_feedback_review_sources.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 async function as(id,fn,role='authenticated'){await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);try{return await fn();}finally{await db.exec('reset role');}}
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const feedback=await as(owner,()=>scalar('select public.submit_finding_feedback($1,0,$2,$3,$4,$5)',[caseId,JSON.stringify(finding),'DIRECT','Scripted proposal; this is not approved gold.',stranger]));
 const read=()=>scalar('select public.get_feedback_review_sources($1)',[feedback]);
 await assert.rejects(()=>as(stranger,read),/denied/);await assert.rejects(()=>as(reviewer,read),/denied/);await assert.rejects(()=>as(null,read,'anon'),/permission denied/);
 await db.query('insert into feedback_private.reviewer_assignments values($1,$2,now())',[owner,reviewer]);
 assert.equal((await as(reviewer,()=>db.query('select * from public.cases'))).rows.length,0);
 const sources=await as(reviewer,read);assert.equal(sources.sourcesUnchanged,true);assert.equal(sources.findingUnchanged,true);assert.match(sources.transcript1,/Did you sign/);
 await as(owner,()=>db.query('update public.cases set transcript1=$1 where id=$2',['Changed source',caseId]));assert.equal((await as(reviewer,read)).sourcesUnchanged,false);
 await assert.rejects(()=>as(reviewer,()=>scalar('select public.review_finding_feedback($1,$2,$3,true,null)',[feedback,'APPROVE','A stale browser must not approve changed sources.'])),/Sources or finding changed/);
 await db.query('delete from feedback_private.reviewer_assignments');await assert.rejects(()=>as(reviewer,read),/denied/);
 }finally{await db.close();}
});
test('correction UI renders save/approval boundaries and escapes testimony without network writes',async()=>{
 const {transformWithOxc}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const url=new URL('../../src/FeedbackReview.jsx',import.meta.url),source=(await readFile(url,'utf8')).replace("import './feedback.css';",'');
 const transformed=await transformWithOxc(source,'FeedbackReview.jsx',{jsx:{runtime:'automatic'}});
 const code=transformed.code.replace(/from ["']([^"']+)["']/g,(_all,dep)=>'from '+JSON.stringify(dep.startsWith('.')?new URL(dep,url).href:import.meta.resolve(dep)));
 const {CorrectionForm,FeedbackInbox}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const props={client:{rpc(){throw Error('No writes during render');}},caseId,finding:{...finding,reasoning:'<script>bad</script>'},findingIndex:0};
 const unsaved=renderToStaticMarkup(React.createElement(CorrectionForm,props));assert.match(unsaved,/Save this case/);assert.match(unsaved,/fieldset disabled/);assert.match(unsaved,/does not train/);
 const saved=renderToStaticMarkup(React.createElement(CorrectionForm,{...props,saved:true}));assert.ok(!saved.includes('fieldset disabled'));assert.ok(!saved.includes('<script>'));
 const inbox=renderToStaticMarkup(React.createElement(FeedbackInbox,{client:props.client,userId:owner,onClose(){}}));assert.match(inbox,/Nothing is automatically approved/);assert.match(inbox,/cannot assign or approve themselves/);
});
