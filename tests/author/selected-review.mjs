// Explicit owner decisions through chat; no label edits or inferred approval.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {atomicJson,digest,validateCases,validateCase,REVIEW_FIELDS} from './schema.mjs';
import {reviewSources} from './level2.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function applySelectedReview({decisionPath,root=path.join(here,'..')}){
 const decisionText=await fs.readFile(decisionPath,'utf8'), d=JSON.parse(decisionText);
 if(d.statement!=='reviewed by AI, approved by zerayyang on 2026-10-14'||d.approval_source!=='explicit user instruction through chat'||!Array.isArray(d.cases)||!d.cases.length||new Set(d.cases.map(x=>x.id)).size!==d.cases.length)throw new Error('Explicit selected owner decisions required');
 const draftPath=path.join(root,'gold.draft.json'),goldPath=path.join(root,'gold.json'),storage=path.join(root,'author','level2-private');
 const lock=await fs.open(`${draftPath}.level2.lock`,'wx',0o600);
 try{
 const dt=await fs.readFile(draftPath,'utf8'),gt=await fs.readFile(goldPath,'utf8');
 const drafts=validateCases(JSON.parse(dt),{statuses:['draft','approved','rejected'],allowReview:true});
 const gold=validateCases(JSON.parse(gt),{statuses:['approved'],allowReview:true});
 const changes=[];
 for(const entry of d.cases){
  const before=drafts.find(c=>c.id===entry.id);
  if(!before||before.status!=='draft'||gold.some(c=>c.id===entry.id)||!['approve','hold'].includes(entry.decision))throw new Error('Only selected pending Level 2 cases supported');
  await reviewSources(before,storage);
  if(!entry.metadata||Object.keys(entry.metadata).some(k=>!REVIEW_FIELDS.includes(k)))throw new Error('Forbidden metadata change');
  if(entry.decision==='approve'&&entry.metadata.verification_policy?.exclude)throw new Error('Excluded case cannot be approved');
  const audit={id:before.id,base_content_sha256:digest(before),metadata:entry.metadata,approval_source:d.approval_source};
  const ah=hash(audit),after={...before,...entry.metadata,source_refs:{...before.source_refs,review_metadata_sha256:ah},status:entry.decision==='approve'?'approved':'draft'};
  if(entry.decision==='approve')after.human_review={method:'explicit-chat-batch',reviewed_by:'AI',approved_by:'zerayyang',approval_date:'2026-10-14',explicit_human_approval:true,explicit_human_review:false,human_verified:false,approval_scope:after.review_policy.approval_scope,statement:d.statement,content_sha256:digest(after),decision:'approve',approval_source:d.approval_source};
  validateCase(after,{statuses:['draft','approved'],allowReview:true}); changes.push({before,after,audit,ah});
 }
 const dir=path.join(root,'author','reviews',`selected-${crypto.randomUUID()}`);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'gold.before.json'),gt,{flag:'wx'});await fs.writeFile(path.join(dir,'gold.draft.before.json'),dt,{flag:'wx'});await fs.writeFile(path.join(dir,'decision.json'),decisionText,{flag:'wx'});
 for(const c of changes){const file=path.join(storage,c.before.source_refs.bundle_id,`metadata-${c.ah}.json`);await atomicJson(file,c.audit);await reviewSources(c.after,storage);}
 const nextDraft=drafts.map(c=>changes.find(x=>x.before.id===c.id)?.after??c),nextGold=[...gold,...changes.filter(c=>c.after.status==='approved').map(c=>c.after)];
 validateCases(nextDraft,{statuses:['draft','approved','rejected'],allowReview:true});validateCases(nextGold,{statuses:['approved'],allowReview:true});
 const journal={state:'intent',completed_files:[],selected_ids:d.cases.map(c=>c.id)};await atomicJson(path.join(dir,'progress.json'),journal);
 if(await fs.readFile(draftPath,'utf8')!==dt||await fs.readFile(goldPath,'utf8')!==gt||await fs.readFile(decisionPath,'utf8')!==decisionText)throw new Error('Concurrent change; snapshots retained');
 await atomicJson(goldPath,nextGold);journal.completed_files.push('gold.json');await atomicJson(path.join(dir,'progress.json'),journal);
 if(await fs.readFile(draftPath,'utf8')!==dt)throw new Error('Concurrent draft change; inspect journal');
 await atomicJson(draftPath,nextDraft);journal.completed_files.push('gold.draft.json');journal.state='complete';await atomicJson(path.join(dir,'progress.json'),journal);
 return {reviewDir:dir,approved:changes.filter(c=>c.after.status==='approved').length,held:changes.filter(c=>c.after.status==='draft').length};
 }finally{await lock.close();await fs.unlink(`${draftPath}.level2.lock`);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4||process.argv[2]!=='--decision')throw new Error('Usage: selected-review.mjs --decision FILE');console.log(JSON.stringify(await applySelectedReview({decisionPath:path.resolve(process.argv[3])})));}
