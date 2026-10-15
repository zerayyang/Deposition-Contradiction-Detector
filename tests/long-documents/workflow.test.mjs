import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {extractPdfDocument} from '../../src/lib/pdfText.js';
import {buildPlan,executePlan,sectionDocument,validateDocuments,parseModelMessage,digest,MODEL} from '../../server/documentAnalysis.js';
import {createAnalysisHandlers} from '../../server/analysisHandlers.js';
import {previewAnalysis,runAnalysis} from '../../src/lib/analysisClient.js';
import {createCaseStore} from '../../src/lib/caseStore.js';
import {documentMetadata,createDocumentStore,MAX_DOCUMENT_BYTES} from '../../src/lib/documentStore.js';
import {uploadResumable} from '../../src/lib/resumableUpload.js';
import {syntheticPdf} from './syntheticPdf.mjs';
const instructions=await readFile(new URL('../../server/proper_prompts.md',import.meta.url),'utf8');
const claim=original=>({original,activityPhrase:original,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const x='I signed the north lease.',y='I never signed the north lease.';
const candidate={type:'DIRECT',severity:'HIGH',reasoning:'Opposite assertions about the lease.',claim1:claim(x),claim2:claim(y)};
const msg=(contradictions=[],extra={})=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({topicsReviewed:['lease'],contradictions})}],usage:{input_tokens:100,output_tokens:50},...extra});
const section=(n,answer)=>`Q: Describe event ${n} on May 15.\nA: ${answer}\n`;
const fakeResponse=()=>{const res=new EventEmitter();Object.assign(res,{statusCode:200,headers:{},lines:[],writableEnded:false,destroyed:false,status(n){this.statusCode=n;return this;},json(v){this.body=v;this.writableEnded=true;return this;},set(v){Object.assign(this.headers,v);return this;},flushHeaders(){},write(v){this.lines.push(v);},end(){this.writableEnded=true;}});return res;};

test('real 225-page PDF exceeds old character limit and preserves every page, Q/A and labels',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pages=Array.from({length:225},(_,i)=>section(i,`Record ${i}:\n`+Array.from({length:120},()=> 'complete testimony '.repeat(5)).join('\n')));
 pages[0]=pages[0].replace('Record 0:',x+' Record 0:');
 const bytes=syntheticPdf(pages,{firstLabel:101});
 assert.ok(bytes.length>2*1024*1024);
 const doc=await extractPdfDocument(bytes,pdfjs);
 assert.equal(doc.extraction.pageCount,225);assert.ok(doc.text.length>500000);
 assert.equal((doc.text.match(/^Q:/gm)??[]).length,225);assert.equal((doc.text.match(/^A:/gm)??[]).length,225);
 assert.equal(doc.extraction.pages[224].pageLabel,'325');assert.equal(doc.extraction.pages[224].end,doc.text.length);
 assert.equal(doc.extraction.textSha256,digest(doc.text));
 assert.equal(validateDocuments([doc.text,'Other testimony'],[{extraction:doc.extraction}])[0].pages.length,225);
 const otherPages=[...pages].reverse().map(text=>text.replace(x,y));
 const other=await extractPdfDocument(syntheticPdf(otherPages),pdfjs);
 const plan=buildPlan([doc.text,other.text],[{extraction:doc.extraction},{extraction:other.extraction}],instructions);
 assert.ok(plan.requestCount>1);assert.equal(plan.requestCount,plan.chunks[0].length*plan.chunks[1].length);
 for(const [i,chunks] of plan.chunks.entries())assert.equal(chunks.map(c=>[doc.text,other.text][i].slice(c.coreStart,c.coreEnd)).join(''),[doc.text,other.text][i]);
 let calls=0;const result=await executePlan({plan,texts:[doc.text,other.text],instructions,callModel:async params=>{calls++;const input=params.messages[0].content;return msg(input.includes(x)&&input.includes(y)?[candidate]:[]);}});
 assert.equal(calls,plan.requestCount);assert.equal(result.analysis.status,'complete');assert.equal(result.analysis.completed,plan.requestCount);assert.equal(result.analysis.coverage[0].pages.length,225);assert.equal(result.analysis.coverage[1].pages.length,225);assert.ok(result.analysis.coverage.every(d=>d.pages.every(p=>p.analysisStatus==='complete')));assert.equal(result.contradictions.length,1);assert.equal(result.contradictions[0].sourceReferences.claim1[0].pdfPage,1);assert.equal(result.contradictions[0].sourceReferences.claim2[0].pdfPage,225);
});

test('OCR/failed pages remain in the manifest; no paid plan can skip them',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await extractPdfDocument(syntheticPdf([section(1,'A complete answer.'),'',section(3,'Another complete answer.')]),pdfjs);
 assert.deepEqual(doc.extraction.ocrPages,[2]);assert.equal(doc.extraction.pages.length,3);
 assert.throws(()=>buildPlan([doc.text,'Other testimony'],[{extraction:doc.extraction}],instructions),/pages 2 require OCR/);
 let destroyed=false;
 const failed=await extractPdfDocument(new Uint8Array(),{getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async n=>{if(n===2)throw new Error('damaged page');return {getTextContent:async()=>({items:[{str:'Complete testimony',hasEOL:true}]})};}}),destroy:async()=>{destroyed=true;}})});
 assert.deepEqual(failed.extraction.failedPages,[2]);assert.equal(destroyed,true);
});

test('all-to-all sections detect distant, reordered testimony and preserve source references',async()=>{
 const a=section(1,x)+Array.from({length:8},(_,i)=>section(i+2,'Only record '+i+'.')).join('');
 const b=Array.from({length:8},(_,i)=>section(i+20,'Other record '+i+'.')).join('')+section(1,y);
 const plan=buildPlan([a,b],[],instructions,{singleRequestBytes:1,chunkBytes:160,overlapBytes:80});
 const called=[];
 const result=await executePlan({plan,texts:[a,b],instructions,callModel:async params=>{const input=params.messages[0].content;called.push(input);return msg(input.includes(x)&&input.includes(y)?[candidate]:[]);}});
 assert.equal(called.length,plan.requestCount);assert.equal(result.analysis.status,'complete');assert.equal(result.contradictions.length,1);
 assert.equal(result.contradictions[0].claim1.original,x);assert.ok(result.contradictions[0].sourceReferences.claim2.some(r=>r.start===b.indexOf(y)));
 assert.equal(result.analysis.coverage[0].totalCharacters,a.length);assert.ok(plan.pairs.some(p=>p.a===0&&p.b===plan.chunks[1].length-1));
 assert.ok(result.contradictions[0].supportingAnalyses.length>=1);
});

test('duplicates with different explanations combine, different types are retained, and scores ignore model metadata',async()=>{
 const texts=[section(1,x),section(1,y)];
 const plan=buildPlan(texts,[],instructions);plan.pairs.push({...plan.pairs[0],id:'repeat'});plan.requestCount++;
 let n=0;
 const result=await executePlan({plan,texts,instructions,callModel:async()=>msg([{...candidate,reasoning:`variant ${++n}`,score:999,humanConfidence:999},...(n===2?[{...candidate,type:'INFERENTIAL'}]:[])])});
 assert.equal(result.contradictions.length,2);assert.equal(result.contradictions[0].supportingAnalyses.length,2);
 assert.notEqual(result.contradictions[0].score,999);assert.equal(result.contradictions[0].score,result.contradictions[1].score);
});

test('failed, truncated and invalid responses stay visible and make partial/failed status; no retries',async()=>{
 const texts=[section(1,x),section(1,y)],plan=buildPlan(texts,[],instructions);plan.pairs.push({...plan.pairs[0],id:'second'});plan.requestCount++;
 let n=0;
 const r=await executePlan({plan,texts,instructions,callModel:async()=>++n===1?msg([candidate]):msg([],{stop_reason:'max_tokens'})});
 assert.equal(n,2);assert.equal(r.analysis.status,'partial');assert.equal(r.analysis.coverage[0].sections[0].status,'partial');assert.equal(r.analysis.failed,1);assert.equal(r.contradictions.length,1);assert.match(r.analysis.tasks[1].error,/incomplete/);
 const bad=await executePlan({plan:buildPlan(texts,[],instructions),texts,instructions,callModel:async()=>msg([{...candidate,claim1:claim('Invented quote')}])});
 assert.equal(bad.analysis.status,'failed');assert.equal(bad.analysis.tasks[0].response.contradictions.length,1);
 assert.throws(()=>parseModelMessage(msg([],{content:[{type:'text',text:'not JSON'}]})),SyntaxError);
});

test('cancellation aborts active model work and prevents remaining requests',async()=>{
 const texts=[section(1,x),section(1,y)],plan=buildPlan(texts,[],instructions);plan.pairs.push({...plan.pairs[0],id:'second'});plan.requestCount++;
 const controller=new AbortController();let calls=0;
 const result=await executePlan({plan,texts,instructions,signal:controller.signal,callModel:async(_params,{signal})=>{calls++;assert.equal(signal,controller.signal);controller.abort();signal.throwIfAborted();}});
 assert.equal(calls,1);assert.equal(result.analysis.status,'cancelled');assert.equal(result.analysis.completed,0);assert.ok(result.analysis.tasks.every(t=>t.status==='cancelled'));
});

test('PDF extraction cancellation destroys task and never reports completion',async()=>{
 const controller=new AbortController();let destroyed=false;
 await assert.rejects(extractPdfDocument(new Uint8Array(),{getDocument:()=>({promise:Promise.resolve({numPages:225,getPage:async()=>{controller.abort();return {getTextContent:async()=>({items:[]})};}}),destroy:async()=>{destroyed=true;}})},()=>{},{signal:controller.signal}),/abort/i);
 assert.equal(destroyed,true);
});

test('plan preview and stale approval cannot spend; legacy short endpoint stays one call with same response shape',async()=>{
 let calls=0;const texts=[section(1,x),section(1,y)];
 const handlers=createAnalysisHandlers({instructions,callModel:async()=>{calls++;return msg([candidate]);}});
 const req={body:{transcript1:texts[0],transcript2:texts[1]}};
 const preview=fakeResponse();handlers.preview(req,preview);assert.equal(calls,0);assert.equal(preview.body.requestCount,1);assert.equal(preview.body.model.id,MODEL.id);assert.ok(preview.body.cost.conservativeBudget>=preview.body.cost.estimated);
 const stale=fakeResponse();await handlers.stream({...req,body:{...req.body,approvedPlanId:'wrong'}},stale);assert.equal(stale.statusCode,409);assert.equal(calls,0);
 const res=fakeResponse();await handlers.analyze(req,res);assert.equal(calls,1);assert.equal(res.body.contradictions.length,1);assert.deepEqual(res.body.topicsReviewed,['lease']);assert.equal(res.body.contradictions[0].type,'DIRECT');
 const stream=fakeResponse();await handlers.stream({...req,body:{...req.body,approvedPlanId:preview.body.id}},stream);assert.equal(calls,2);assert.equal(JSON.parse(stream.lines.at(-1)).analysis.status,'complete');
});

test('edited or incomplete page manifests fail closed; plain text has offsets without invented pages',()=>{
 const text=section(1,x),extraction={textSha256:digest(text),textLength:text.length,pageCount:1,pages:[{pdfPage:1,pageLabel:'1',start:0,end:text.length-1,status:'TEXT'}]};
 assert.throws(()=>validateDocuments([text,'Other'],[{extraction}]),/entire/);
 assert.throws(()=>validateDocuments([text,'Other'],[{pageMappingStale:true}]),/edited/);
 assert.throws(()=>validateDocuments([text,'Other'],[{extraction:{...extraction,textSha256:'incorrect'}}]),/no longer matches/);
 assert.equal(buildPlan([text,'Other'],[],instructions).manifests[0],null);
});

test('client streams split UTF-8 records, rejects lost final results and cancels without a server',async()=>{
 const events=[{event:'checkpoint',contradictions:[],analysis:{status:'running'}},{event:'result',contradictions:[],analysis:{status:'complete'}}];
 const text=events.map(e=>JSON.stringify(e)).join('\n')+'\n';const bytes=new TextEncoder().encode(text);
 const fake=async()=>new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,11));c.enqueue(bytes.slice(11));c.close();}}),{status:200});
 const seen=[];const r=await runAnalysis({}, {id:'plan'},{fetchImpl:fake,onEvent:e=>seen.push(e)});assert.equal(r.analysis.status,'complete');assert.equal(seen.length,2);
 await assert.rejects(runAnalysis({}, {id:'plan'},{fetchImpl:async()=>new Response(JSON.stringify(events[0])+'\n')}),/before the final/);
 const controller=new AbortController();
 await assert.rejects(runAnalysis({}, {id:'plan'},{signal:controller.signal,fetchImpl:fake,onEvent:()=>controller.abort()}),/abort/i);
 let calls=0;await previewAnalysis({}, {fetchImpl:async()=>{calls++;return new Response(JSON.stringify({requestCount:1,cost:{estimated:1}}));}});assert.equal(calls,1);
});

test('50 MiB storage budget and page/partial-result metadata survive case persistence',async()=>{
 assert.equal(MAX_DOCUMENT_BYTES,52428800);
 const extraction={pageCount:225,pages:[],ocrPages:[],failedPages:[]};
 const file={path:'owner/case/doc.pdf',name:'doc.pdf',size:3*1024*1024,type:'application/pdf',extraction};
 assert.equal(documentMetadata(file).extraction.pageCount,225);
 let payload;const client={from:()=>({update:p=>{payload=p;return {eq:()=>({select:()=>({single:async()=>({data:{id:'case'}})})})};}})};
 await createCaseStore(client).save('case',{texts:['a','b'],files:[file,null],results:[],analysis:{status:'partial',completed:2,planned:3},notes:{},reviewed:{}});
 assert.equal(payload.review_notes.documents[0].extraction.pageCount,225);assert.equal(payload.results.analysis.status,'partial');
 await assert.rejects(createDocumentStore(null,'owner').upload('case',{name:'huge.pdf',size:MAX_DOCUMENT_BYTES+1}),/50 MiB/);
});

test('large TUS uploads preserve every byte with fixed chunks and authenticated requests; cancellation stops PATCHes',async()=>{
 const file=new File(['a'.repeat(7*1024*1024)],'big.pdf');let offset=0,patches=0;
 const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test-token'}}})},storage:{url:'https://example.invalid/storage/v1'}};
 const fetchImpl=async(url,options)=>{
  assert.match(options.headers.Authorization,/synthetic-test-token/);
  if(options.method==='POST')return new Response(null,{status:201,headers:{Location:'/storage/v1/upload/resumable/id'}});
  patches++;assert.equal(Number(options.headers['Upload-Offset']),offset);const data=await options.body.text();assert.ok([...data].every(c=>c==='a'));offset+=options.body.size;return new Response(null,{status:204,headers:{'Upload-Offset':String(offset)}});
 };
 await uploadResumable(client,'owner/case/file.pdf',file,'application/pdf',{fetchImpl});assert.equal(offset,file.size);assert.equal(patches,2);
 const controller=new AbortController();patches=0;offset=0;
 await assert.rejects(uploadResumable(client,'owner/case/file.pdf',file,'application/pdf',{signal:controller.signal,fetchImpl,onProgress:()=>controller.abort()}),/abort/i);assert.equal(patches,1);
});

test('large short-endpoint inputs require a preview rather than starting many paid calls',async()=>{
 let calls=0;const handlers=createAnalysisHandlers({instructions,callModel:async()=>{calls++;return msg();}});
 const req={body:{transcript1:section(1,'a'.repeat(500000)),transcript2:section(2,'b'.repeat(500000))}};
 const res=fakeResponse();await handlers.analyze(req,res);assert.equal(calls,0);assert.equal(res.statusCode,428);assert.ok(res.body.plan.requestCount>1);
});

test('full Q/A context survives page boundaries and a long continued answer; Unicode core coverage is lossless',()=>{
 const text='Q: Where were you on May 15?\nA: '+'\u{1f600}x'.repeat(1000)+'\nQ: What next?\nA: I went home.';
 const chunks=sectionDocument(text,{chunkBytes:500,overlapBytes:40});
 assert.equal(chunks.map(c=>text.slice(c.coreStart,c.coreEnd)).join(''),text);
 assert.ok(chunks.slice(1,-1).some(c=>c.questionContext.includes('Where were you on May 15?')));
 for(const chunk of chunks)assert.ok(!/[\uDC00-\uDFFF]/.test(chunk.text[0]));
});

test('PDF citations span multiple original pages and include every repeated source occurrence',async()=>{
 const a=section(1,x)+'\n'+section(2,x),b=section(1,y),split=a.indexOf('lease.');
 const manifest={version:1,textSha256:digest(a),textLength:a.length,pageCount:2,pages:[{pdfPage:1,pageLabel:'i',start:0,end:split,status:'TEXT'},{pdfPage:2,pageLabel:'ii',start:split+2,end:a.length,status:'TEXT'}]};
 // A real extraction page separator; the first quote spans that separator exactly.
 const text=a.slice(0,split)+'\n\n'+a.slice(split);manifest.textSha256=digest(text);manifest.textLength=text.length;manifest.pages[1].end=text.length;
 const quote=x.replace('lease.','\n\nlease.');
 const c={...candidate,claim1:claim(quote)};
 const plan=buildPlan([text,b],[{extraction:manifest}],instructions);
 const r=await executePlan({plan,texts:[text,b],instructions,callModel:async()=>msg([c])});
 assert.deepEqual(r.contradictions[0].sourceReferences.claim1.map(p=>p.pdfPage),[1,2]);
 const repeatPlan=buildPlan([a,b],[],instructions),repeated=await executePlan({plan:repeatPlan,texts:[a,b],instructions,callModel:async()=>msg([candidate])});
 assert.equal(repeated.contradictions[0].sourceReferences.claim1.length,2);
});

test('Express body parser enforces the configured budget without starting a listener',async()=>{
 const {Readable}=await import('node:stream');const {createApp}=await import('../../server/app.js');
 const app=createApp({instructions,callModel:()=>assert.fail('No model call'),requestLimitBytes:128});
 const parser=app.router.stack.find(layer=>layer.name==='jsonParser').handle;
 const invoke=body=>new Promise(resolve=>{const req=Readable.from([Buffer.from(body)]);req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(body))};req.method='POST';parser(req,{},error=>resolve({error,body:req.body}));});
 assert.equal((await invoke('{"ok":true}')).body.ok,true);
 assert.equal((await invoke(JSON.stringify({text:'x'.repeat(200)}))).error.type,'entity.too.large');
});

test('storage and provider failures cannot be presented as complete',async()=>{
 const file=new File(['test bytes'],'tiny.pdf');const controller=new AbortController();
 await assert.rejects(createDocumentStore({auth:{getSession:async()=>({error:new Error('Session expired')})}},'owner',()=> 'file').upload('case',file,{signal:controller.signal}),/Session expired/);
 const texts=[section(1,x),section(1,y)];
 const r=await executePlan({plan:buildPlan(texts,[],instructions),texts,instructions,callModel:async()=>{throw new Error('Provider unavailable');}});
 assert.equal(r.analysis.status,'failed');assert.equal(r.analysis.completed,0);assert.match(r.analysis.tasks[0].error,/unavailable/);
});

test('closing the streamed response propagates cancellation to the SDK without any listener',async()=>{
 let calls=0,aborted=false,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const handlers=createAnalysisHandlers({instructions,callModel:(_params,{signal})=>{calls++;started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}));}});
 const body={transcript1:section(1,x),transcript2:section(1,y)},preview=fakeResponse();handlers.preview({body},preview);
 const res=fakeResponse(),running=handlers.stream({body:{...body,approvedPlanId:preview.body.id}},res);
 await ready;res.destroyed=true;res.emit('close');await running;assert.equal(calls,1);assert.equal(aborted,true);assert.equal(res.listenerCount('close'),0);
});

test('text budgets fail explicitly rather than shortening inputs',()=>{
 assert.throws(()=>buildPlan(['a'.repeat(12*1024*1024+1),'Other'],[],instructions),/No text was truncated/);
});
