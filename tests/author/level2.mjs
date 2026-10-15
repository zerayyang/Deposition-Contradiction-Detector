import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {atomicJson,exists,validateCases,validateCase,digest,selectTemperature,extractResponseText,REVIEW_FIELDS} from './schema.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const root=path.join(here,'level2-private');
const safe=id=>{if(!/^[a-z0-9][a-z0-9_-]*$/i.test(id??''))throw new Error('Use a simple unique bundle ID');return id;};
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
export async function extractDocument(file) {
  const bytes=await fs.readFile(file),extension=path.extname(file).toLowerCase();
  if(['.txt','.md'].includes(extension)){
    new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const text=bytes.toString('utf8');if(!text.trim())throw new Error('Empty source document');
    return {bytes,text,pages:[],extraction:'verbatim UTF-8; no whitespace normalization',extension};
  }
  if(extension!=='.pdf')throw new Error('Supported documents: UTF-8 .txt/.md or selectable-text .pdf; convert other formats explicitly');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fontPath=path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),'standard_fonts')+path.sep;
  const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:false,isEvalSupported:false,standardFontDataUrl:fontPath});
  const pdf=await loading.promise;
  let text='';const pages=[];
  try {for(let number=1;number<=pdf.numPages;number++){
    const page=await pdf.getPage(number),content=await page.getTextContent();
    const start=text.length;
    for(const item of content.items)if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');
    pages.push({page:number,start,end:text.length});text+='\n';
  }}finally{await loading.destroy();}
  if(!text.trim())throw new Error('PDF has no selectable text; OCR/export must be supplied separately and reviewed');
  return {bytes,text,pages,extraction:'PDF.js selectable text; passages are exact in this saved extraction, not PDF byte offsets; check layout against original',extension};
}
// Snapshot originals and extraction; never overwrite a previous bundle.
export async function prepareBundle({id,testimony1,testimony2,reference,source1,source2,referenceSource,storage=root}) {
  safe(id);const directory=path.join(storage,id);
  const inputs=[['testimony1',testimony1,source1],['testimony2',testimony2,source2],['reference',reference,referenceSource]];
  if(inputs.some(([,file,citation])=>!file||typeof citation!=='string'||!citation.trim()))throw new Error('All three documents require paths and source citations');
  const extracted=await Promise.all(inputs.map(async ([role,file,citation])=>({role,file,citation,...await extractDocument(file)})));
  await fs.mkdir(storage,{recursive:true});await fs.mkdir(directory,{mode:0o700});
  const manifest={version:1,id,created_at:new Date().toISOString(),documents:{},notice:'Reference analysis is author-only background, not detector input or automatic ground truth.'};
  for(const doc of extracted){
    const original=`${doc.role}.original${doc.extension}`,textFile=`${doc.role}.txt`;
    await fs.writeFile(path.join(directory,original),doc.bytes,{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(directory,textFile),doc.text,{flag:'wx',mode:0o600});
    manifest.documents[doc.role]={document_id:`${id}-${doc.role}`,source:doc.citation,original_name:path.basename(doc.file),original,text_file:textFile,original_sha256:sha(doc.bytes),text_sha256:sha(doc.text),pages:doc.pages,extraction:doc.extraction};
  }
  await atomicJson(path.join(directory,'manifest.json'),manifest);
  return {directory,manifest};
}
export async function loadBundle(id,storage=root){
  safe(id);const directory=path.join(storage,id),manifest=await read(path.join(directory,'manifest.json')),texts={};
  if(manifest.id!==id)throw new Error('Bundle ID mismatch');
  for(const role of ['testimony1','testimony2','reference']){
    const d=manifest.documents[role];
    // File names come from our format, never from paths supplied in a manifest.
    if(d.text_file!==`${role}.txt`||!new RegExp(`^${role}\\.original\\.(txt|md|pdf)$`).test(d.original))throw new Error('Invalid bundle path');
    const bytes=await fs.readFile(path.join(directory,d.original));texts[role]=await fs.readFile(path.join(directory,d.text_file),'utf8');
    if(sha(bytes)!==d.original_sha256||sha(texts[role])!==d.text_sha256)throw new Error(`Source changed: ${role}`);
  }
  return {directory,manifest,texts};
}
function passage(text,p){
  if(!p||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||p.end>text.length||typeof p.quote!=='string'||!p.quote.trim()||text.slice(p.start,p.end)!==p.quote||typeof p.location!=='string'||!p.location.trim())throw new Error('Passage must match exact UTF-16 offsets, quote and nonempty source location');
  return p.quote;
}
export function makeDraft(proposal,bundle){
  if(!proposal||Object.keys(proposal).some(k=>!['case','passages','reference_findings'].includes(k)))throw new Error('Unexpected proposal field');
  const row=validateCase(proposal.case);
  if(!row.id.startsWith(`l2-${bundle.manifest.id}-`))throw new Error('Case ID must start l2-BUNDLE_ID-');
  const refs={level:2,bundle_id:bundle.manifest.id,proposal_sha256:sha(JSON.stringify(proposal))};
  for(const [side,key] of [['testimony1','transcript1_text'],['testimony2','transcript2_text']]){
    const p=proposal.passages?.[side],text=passage(bundle.texts[side],p),doc=bundle.manifest.documents[side];
    if(row[key]!==text)throw new Error(`Detector input differs from ${side} passage`);
    refs[side]={document_id:doc.document_id,source:doc.source,text_sha256:doc.text_sha256,start:p.start,end:p.end,location:p.location};
  }
  if(!Array.isArray(proposal.reference_findings)||!proposal.reference_findings.length)throw new Error('Cite at least one reference passage; no inferred reference findings');
  for(const finding of proposal.reference_findings){passage(bundle.texts.reference,finding);if(!['supports','disagrees','context_only'].includes(finding.relation))throw new Error('Explain reference relation: supports, disagrees, context_only');}
  // Reference passages intentionally do not enter the gold handoff or detector text.
  return {...row,source_refs:refs,review_policy:{band_assertion:'informational',evidence_assertion:'required',approval_scope:'TYPE_AND_EVIDENCE'}};
}
export async function appendDrafts({bundleId,proposals,draftFile=path.join(here,'..','gold.draft.json'),storage=root}){
  const bundle=await loadBundle(bundleId,storage);
  if(!Array.isArray(proposals)||!proposals.length)throw new Error('Expected a nonempty proposal array');
  const additions=proposals.map(p=>makeDraft(p,bundle));
  // Exclusive lock + compare-before-write prevents two Level 2 appenders losing drafts.
  const lock=await fs.open(`${draftFile}.level2.lock`,'wx',0o600);
  try {
    const snapshot=await exists(draftFile)?await fs.readFile(draftFile,'utf8'):null;
    const old=snapshot===null?[]:validateCases(JSON.parse(snapshot),{statuses:['draft','approved','rejected'],allowReview:true});
    const merged=validateCases([...old,...additions],{statuses:['draft','approved','rejected'],allowReview:true});
    const audit=path.join(bundle.directory,`append-${crypto.randomUUID()}.json`);
    await atomicJson(audit,{status:'append-intent',before_sha256:snapshot===null?null:sha(snapshot),proposals,draft_ids:additions.map(r=>r.id)});
    if((await exists(draftFile)?await fs.readFile(draftFile,'utf8'):null)!==snapshot)throw new Error('Drafts changed during append; refusing to overwrite');
    await atomicJson(draftFile,merged);
    return {added:additions.length,total:merged.length,audit};
  } finally {await lock.close();await fs.unlink(`${draftFile}.level2.lock`);}
}
export async function reviewSources(row,storage=root){
  if(!row.source_refs)return null;
  const bundle=await loadBundle(row.source_refs.bundle_id,storage);
  const files=(await fs.readdir(bundle.directory)).filter(n=>/^append-[a-f0-9-]+\.json$/.test(n));
  for(const file of files){const audit=await read(path.join(bundle.directory,file));
    for(const proposal of audit.proposals??[]){
      if(sha(JSON.stringify(proposal))!==row.source_refs.proposal_sha256)continue;
      const restored=makeDraft(proposal,bundle);
      if(row.source_refs.review_metadata_sha256){
        const audit=await read(path.join(bundle.directory,`metadata-${row.source_refs.review_metadata_sha256}.json`));
        if(sha(JSON.stringify(audit))!==row.source_refs.review_metadata_sha256||audit.id!==row.id||audit.base_content_sha256!==digest(restored)||Object.keys(audit.metadata).some(k=>!REVIEW_FIELDS.includes(k))) throw new Error('Invalid metadata audit');
        Object.assign(restored,audit.metadata); restored.source_refs.review_metadata_sha256=row.source_refs.review_metadata_sha256;
      }
      if(digest(restored)!==digest(row))throw new Error('Level 2 content changed since source validation; append a new proposal with a new ID');
      return {documents:bundle.manifest.documents,reference_findings:proposal.reference_findings,notice:'Reference analysis is separate background; approve the actual testimony and labels yourself.'};
    }
  }
  throw new Error('Level 2 proposal audit missing; approval refused');
}
// Explicit author-generation operation only. The injected client is used by local tests.
export async function generateDrafts({bundleId,count=5,model='claude-opus-5-5',providerDefaultTemperature=false,client=null,storage=root,draftFile=path.join(here,'..','gold.draft.json')}) {
  if(!Number.isInteger(count)||count<1||count>25)throw new Error('count must be an integer from 1 to 25');
  const bundle=await loadBundle(bundleId,storage);
  const size=Object.values(bundle.texts).reduce((n,t)=>n+t.length,0);
  if(size>120000)throw new Error('Source bundle exceeds 120000 UTF-16 units; provide explicitly scoped saved documents. No truncation or API call performed.');
  const prompt=await fs.readFile(path.join(here,'LEVEL2_MODEL_PROMPT.md'),'utf8');
  const selection=selectTemperature(model,providerDefaultTemperature);
  const documents=Object.fromEntries(['testimony1','testimony2','reference'].map(role=>[role,{...bundle.manifest.documents[role],text:bundle.texts[role]}]));
  const request={model,...selection.parameters,max_tokens:16000,system:prompt,
    messages:[{role:'user',content:JSON.stringify({bundle_id:bundleId,requested_count:count,documents})}]};
  const directory=path.join(bundle.directory,`generation-${crypto.randomUUID()}`);await fs.mkdir(directory,{mode:0o700});
  await atomicJson(path.join(directory,'request.json'),{...request,temperatureMode:selection.temperatureMode,temperatureRequested:selection.temperatureRequested});
  console.log(`Level 2 author generation: ${model}; temperature mode ${selection.temperatureMode}; one request, no retries. Sources remain separate from detector inputs.`);
  try {
    if(!client){await import('dotenv/config');const {default:Anthropic}=await import('@anthropic-ai/sdk');client=new Anthropic({maxRetries:0});}
    const response=await client.messages.create(request);
    await atomicJson(path.join(directory,'response.json'),response);
    const raw=(response.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    await fs.writeFile(path.join(directory,'raw-text.txt'),raw,{flag:'wx',mode:0o600});
    const proposals=JSON.parse(extractResponseText(response));
    if(!Array.isArray(proposals)||proposals.length!==count)throw new Error(`Requested ${count} proposals; received ${Array.isArray(proposals)?proposals.length:'non-array'}. Nothing appended.`);
    for(const proposal of proposals)makeDraft(proposal,bundle);
    await atomicJson(path.join(directory,'proposals.json'),proposals);
    const result=await appendDrafts({bundleId,proposals,draftFile,storage});
    await atomicJson(path.join(directory,'result.json'),{...result,status:'drafts-appended',usage:response.usage??null});
    return {...result,directory};
  }catch(error){await atomicJson(path.join(directory,'error.json'),{message:error.message});throw new Error(`Level 2 generation failed: ${error.message}. Preserved diagnostics: ${directory}`);}
}
async function main(){
  const [command,...args]=process.argv.slice(2),options={};
  if(command==='--help'||!command){console.log('prepare --id ID --testimony1 FILE --testimony2 FILE --reference FILE --source1 CITATION --source2 CITATION --reference-source CITATION\nappend --bundle ID --proposals FILE\ngenerate --bundle ID [--count 5] [--model MODEL]\nOnly generate calls Claude (one request, no retries). No automatic approval. See tests/author/LEVEL2.md.');return;}
  for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1]||options[args[i].slice(2)])throw new Error('Expected unique --name value arguments');options[args[i].slice(2)]=args[i+1];}
  const allowed=command==='prepare'?['id','testimony1','testimony2','reference','source1','source2','reference-source']:command==='append'?['bundle','proposals']:command==='generate'?['bundle','count','model']:[];
  if(!allowed.length||Object.keys(options).some(k=>!allowed.includes(k)))throw new Error('Unknown command or option');
  if(command==='generate')await import('dotenv/config');
  const result=command==='prepare'?await prepareBundle({...options,referenceSource:options['reference-source']}):command==='generate'?await generateDrafts({bundleId:options.bundle,count:options.count===undefined?5:Number(options.count),model:options.model??process.env.TEST_AUTHOR_MODEL??'claude-opus-5-5'}):await appendDrafts({bundleId:options.bundle,proposals:await read(options.proposals)});
  console.log(command==='prepare'?`Saved author-only bundle: ${result.directory}. No cases generated.`:JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
