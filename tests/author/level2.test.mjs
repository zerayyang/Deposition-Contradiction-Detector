import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareBundle,loadBundle,appendDrafts,makeDraft,reviewSources,sha,extractDocument,generateDrafts} from './level2.mjs';
import {validateCases,digest} from './schema.mjs';
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deposition-level2-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const contents={testimony1:'Q: First?\r\nA: Alpha.\r\n',testimony2:'Q: Second?\nA: Beta.\n',reference:'Synthetic reference commentary.\n'};
 const files={};for(const [role,text] of Object.entries(contents)){files[role]=path.join(dir,role+'.txt');await fs.writeFile(files[role],text);}
 const storage=path.join(dir,'private'),draftFile=path.join(dir,'drafts.json');
 const args={id:'fixture',...files,source1:'Synthetic A, paragraph 1',source2:'Synthetic B, paragraph 1',referenceSource:'Synthetic reference, paragraph 1',storage};
 await prepareBundle(args);const bundle=await loadBundle('fixture',storage);
 const p=(text,quote=text)=>({start:text.indexOf(quote),end:text.indexOf(quote)+quote.length,quote,location:'Synthetic paragraph 1'});
 const proposal={case:{id:'l2-fixture-one',transcript1_text:contents.testimony1,transcript2_text:contents.testimony2,expected_type:'FALSE_POSITIVE',expected_evidence:'NOT_EVALUABLE',expected_score_band:null,tricky_feature:'Tooling-only fixture',rationale:'Synthetic protocol fixture, not a corpus label.',status:'draft'},passages:{testimony1:p(contents.testimony1),testimony2:p(contents.testimony2)},reference_findings:[{...p(contents.reference),relation:'context_only'}]};
 return {dir,contents,files,storage,draftFile,args,bundle,proposal};
}
test('intake preserves originals, exact newlines, citations and hashes without creating tests',async t=>{
 const f=await fixture(t);assert.equal(f.bundle.texts.testimony1,f.contents.testimony1);
 const d=f.bundle.manifest.documents.testimony1;assert.equal(d.text_sha256,sha(f.contents.testimony1));assert.match(d.source,/Synthetic A/);
 assert.equal(await fs.readFile(path.join(f.bundle.directory,d.original),'utf8'),f.contents.testimony1);
 await assert.rejects(fs.access(f.draftFile));await assert.rejects(prepareBundle(f.args),/EEXIST/);
});
test('append retains all existing rows and analysis remains outside detector inputs and handoff',async t=>{
 const f=await fixture(t),existing={...f.proposal.case,id:'existing',status:'rejected'};
 await fs.writeFile(f.draftFile,JSON.stringify([existing]));
 const result=await appendDrafts({bundleId:'fixture',proposals:[f.proposal],storage:f.storage,draftFile:f.draftFile});
 assert.equal(result.added,1);const rows=JSON.parse(await fs.readFile(f.draftFile,'utf8'));
 assert.deepEqual(rows[0],existing);assert.equal(rows[1].status,'draft');assert.equal(rows[1].human_review,undefined);
 assert.equal(rows[1].reference_findings,undefined);assert.ok(!JSON.stringify(rows[1]).includes('Synthetic reference commentary'));
 assert.equal(rows[1].transcript1_text,f.contents.testimony1);
 validateCases(rows,{statuses:['draft','rejected'],allowReview:true});
 const review=await reviewSources(rows[1],f.storage);assert.equal(review.reference_findings[0].quote,f.contents.reference);
});
test('duplicates, modified passages and pre-approved proposals fail without corpus changes',async t=>{
 const f=await fixture(t);await fs.writeFile(f.draftFile,'[]');
 for(const mutate of [p=>p.case.status='approved',p=>p.passages.testimony1.start++,p=>p.case.transcript1_text='Rewritten',p=>p.passages.testimony2.location='',p=>p.reference_findings[0].quote='Invented',p=>p.reference_findings=[]]){
  const proposal=structuredClone(f.proposal);mutate(proposal);
  await assert.rejects(appendDrafts({bundleId:'fixture',proposals:[proposal],storage:f.storage,draftFile:f.draftFile}));
  assert.equal(await fs.readFile(f.draftFile,'utf8'),'[]');
 }
 await appendDrafts({bundleId:'fixture',proposals:[f.proposal],storage:f.storage,draftFile:f.draftFile});
 const before=await fs.readFile(f.draftFile,'utf8');
 await assert.rejects(appendDrafts({bundleId:'fixture',proposals:[f.proposal],storage:f.storage,draftFile:f.draftFile}),/Duplicate ID/);
 assert.equal(await fs.readFile(f.draftFile,'utf8'),before);
});
test('source changes, missing audit and changed labels block source review',async t=>{
 const f=await fixture(t),row=makeDraft(f.proposal,f.bundle);
 await assert.rejects(reviewSources(row,f.storage),/audit missing/);
 await appendDrafts({bundleId:'fixture',proposals:[f.proposal],storage:f.storage,draftFile:f.draftFile});
 const changed={...row,expected_type:'DIRECT'};assert.notEqual(digest(changed),digest(row));
 await assert.rejects(reviewSources(changed,f.storage),/content changed/);
 await fs.appendFile(path.join(f.bundle.directory,'reference.txt'),'Altered');
 await assert.rejects(reviewSources(row,f.storage),/Source changed/);
});
test('concurrent appenders cannot replace each other; exclusive lock is respected',async t=>{
 const f=await fixture(t);await fs.writeFile(f.draftFile,'[]');await fs.writeFile(f.draftFile+'.level2.lock','held');
 await assert.rejects(appendDrafts({bundleId:'fixture',proposals:[f.proposal],storage:f.storage,draftFile:f.draftFile}),/EEXIST/);
 assert.equal(await fs.readFile(f.draftFile,'utf8'),'[]');
});
test('invalid formats, non-UTF8 and empty sources fail explicitly',async t=>{
 const f=await fixture(t);for(const [name,bytes] of [['a.docx',Buffer.from('x')],['a.txt',Buffer.from([0xff])],['empty.md',Buffer.from(' ')]] ){
  const file=path.join(f.dir,name);await fs.writeFile(file,bytes);await assert.rejects(extractDocument(file));
 }
});
function simplePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream='BT /F1 12 Tf 10 200 Td (Synthetic PDF passage.) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return pdf;
}
test('PDF import preserves original bytes and page spans, marks extraction provenance',async t=>{
 const f=await fixture(t),file=path.join(f.dir,'test.pdf');await fs.writeFile(file,simplePdf());
 const doc=await extractDocument(file);assert.match(doc.text,/Synthetic PDF passage/);assert.equal(doc.pages.length,1);
 assert.match(doc.extraction,/not PDF byte offsets/);assert.equal(doc.pages[0].page,1);
 assert.equal(doc.text.slice(doc.pages[0].start,doc.pages[0].end).trim(),'Synthetic PDF passage.');
 assert.equal(doc.bytes.toString(),simplePdf());
});

test('explicit generation sends fresh separated sources and appends only unapproved validated drafts',async t=>{
 const f=await fixture(t);let calls=0;
 const client={messages:{create:async request=>{
  calls++;assert.equal(request.messages.length,1);
  const payload=JSON.parse(request.messages[0].content);
  assert.deepEqual(Object.keys(payload.documents),['testimony1','testimony2','reference']);
  assert.equal(payload.documents.reference.text,f.contents.reference);
  assert.equal(payload.documents.testimony1.text,f.contents.testimony1);
  assert.equal(request.temperature,0);
  return {stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify([f.proposal])}],usage:{input_tokens:100,output_tokens:50}};
 }}};
 const result=await generateDrafts({bundleId:'fixture',count:1,model:'test-model',client,storage:f.storage,draftFile:f.draftFile});
 assert.equal(calls,1);assert.equal(result.added,1);
 const rows=JSON.parse(await fs.readFile(f.draftFile,'utf8'));assert.equal(rows[0].status,'draft');assert.equal(rows[0].human_review,undefined);
 assert.equal(rows[0].reference_findings,undefined);
 const audit=JSON.parse(await fs.readFile(path.join(result.directory,'result.json'),'utf8'));assert.equal(audit.usage.input_tokens,100);
});
test('invalid generated text fails visibly with raw output and no append or hidden retry',async t=>{
 const f=await fixture(t);await fs.writeFile(f.draftFile,'[]');let calls=0;
 const client={messages:{create:async()=>{calls++;return {stop_reason:'end_turn',content:[{type:'text',text:'[]'}]};}}};
 await assert.rejects(generateDrafts({bundleId:'fixture',count:1,client,storage:f.storage,draftFile:f.draftFile}),/Nothing appended/);
 assert.equal(calls,1);assert.equal(await fs.readFile(f.draftFile,'utf8'),'[]');
 const [dir]=(await fs.readdir(f.bundle.directory)).filter(x=>x.startsWith('generation-'));
 assert.equal(await fs.readFile(path.join(f.bundle.directory,dir,'raw-text.txt'),'utf8'),'[]');
 await assert.rejects(generateDrafts({bundleId:'fixture',count:0,client,storage:f.storage,draftFile:f.draftFile}),/count/);assert.equal(calls,1);
});

test('audited review metadata remains source-bound and rejects tampering',async t=>{
 const f=await fixture(t);await appendDrafts({bundleId:'fixture',proposals:[f.proposal],draftFile:f.draftFile,storage:f.storage});
 const row=JSON.parse(await fs.readFile(f.draftFile,'utf8'))[0];
 const metadata={target_claims:{claim1:'Alpha.',claim2:'Beta.'},judicial_relation:'context_only',conflict_basis:'not_determinable_from_input',type_basis:'project_rule',judicial_expected_evidence:'CONFLICT',verification_policy:{exclude:false,reason:'Synthetic protocol fixture'}};
 const audit={id:row.id,base_content_sha256:digest(row),metadata,approval_source:'explicit user instruction through chat'};
 const ah=sha(JSON.stringify(audit));await fs.writeFile(path.join(f.bundle.directory,`metadata-${ah}.json`),JSON.stringify(audit));
 Object.assign(row,metadata);row.source_refs.review_metadata_sha256=ah;
 validateCases([row],{allowReview:true});await reviewSources(row,f.storage);
 const changed=structuredClone(row);changed.target_claims.claim1='First?';await assert.rejects(reviewSources(changed,f.storage),/content changed/);
 changed.target_claims.claim1='fabricated';assert.throws(()=>validateCases([changed],{allowReview:true}),/exact/);
 audit.metadata.judicial_relation='supports';await fs.writeFile(path.join(f.bundle.directory,`metadata-${ah}.json`),JSON.stringify(audit));await assert.rejects(reviewSources(row,f.storage),/Invalid metadata audit/);
});

test('selected chat review approves only selected sources and preserves labels and holds',async t=>{
 const {applySelectedReview}=await import('./selected-review.mjs');const f=await fixture(t);
 const root=path.join(f.dir,'review-root'),storage=path.join(root,'author','level2-private');await fs.mkdir(root,{recursive:true});
 await prepareBundle({...f.args,storage});const draftFile=path.join(root,'gold.draft.json');
 await appendDrafts({bundleId:'fixture',proposals:[f.proposal,{...f.proposal,case:{...f.proposal.case,id:'l2-fixture-two'}}],draftFile,storage});
 await fs.writeFile(path.join(root,'gold.json'),'[]');
 const metadata={target_claims:{claim1:'Alpha.',claim2:'Beta.'},judicial_relation:'context_only',conflict_basis:'not_determinable_from_input',type_basis:'project_rule',judicial_expected_evidence:'CONFLICT',verification_policy:{exclude:false,reason:'Synthetic'}};
 const decision={statement:'reviewed by AI, approved by zerayyang on 2026-10-14',approval_source:'explicit user instruction through chat',cases:[{id:'l2-fixture-one',decision:'approve',metadata}]};
 const dp=path.join(f.dir,'decision.json');await fs.writeFile(dp,JSON.stringify(decision));const result=await applySelectedReview({decisionPath:dp,root});assert.equal(result.approved,1);
 const rows=JSON.parse(await fs.readFile(draftFile,'utf8')),gold=JSON.parse(await fs.readFile(path.join(root,'gold.json'),'utf8'));assert.equal(rows[1].status,'draft');assert.equal(gold.length,1);assert.equal(gold[0].expected_evidence,'NOT_EVALUABLE');assert.equal(gold[0].human_review.human_verified,false);await reviewSources(gold[0],storage);
 decision.cases=[{id:'l2-fixture-two',decision:'approve',metadata:{...metadata,expected_type:'DIRECT'}}];await fs.writeFile(dp,JSON.stringify(decision));await assert.rejects(applySelectedReview({decisionPath:dp,root}),/Forbidden metadata/);
});
