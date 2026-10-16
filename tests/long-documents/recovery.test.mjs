import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfQuoteMap,groundPdfClaim} from '../../server/pdfQuoteGrounding.js';
import {buildPlan,executePlan,digest,OUTPUT_TOKENS,SECTION_OUTPUT_TOKENS} from '../../server/documentAnalysis.js';
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const candidate=(a,b)=>({type:'DIRECT',severity:'HIGH',reasoning:'Opposite answers about the same signing.',claim1:claim(a),claim2:claim(b)});
const message=contradictions=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({topicsReviewed:['signing'],contradictions})}],usage:{input_tokens:120,output_tokens:80,thinking_tokens:40}});
const document=text=>({extraction:{textSha256:digest(text),textLength:text.length,pageCount:1,pages:[{pdfPage:1,pageLabel:'42',start:0,end:text.length,status:'TEXT'}]}});
const pdf='1 Q Did you sign the lease? 10:00:00\n2 A I signed the 10:00:01\n3 north lease. 10:00:02\n4 Q Were you certain? 10:00:03\n5 A Yes. 10:00:04';

test('layout mapping restores exact source span and extracted phrases with offsets and audit',()=>{
 const map=pdfQuoteMap(pdf,document(pdf).extraction);
 const input={...claim('I signed the north lease.'),activityPhrase:'signed the north lease'};
 const got=groundPdfClaim(input,pdf,map,{start:0,end:pdf.length,text:pdf});
 assert.equal(got.claim.original,'I signed the 10:00:01\n3 north lease.');
 assert.equal(got.claim.activityPhrase,'signed the 10:00:01\n3 north lease');
 assert.equal(got.audit.modelOriginal,input.original);
 assert.equal(pdf.slice(got.audit.start,got.audit.end),got.claim.original);
 assert.equal(input.original,'I signed the north lease.');
});
test('no case, punctuation, negation or word correction; ambiguous and out-of-section matches rejected',()=>{
 const map=pdfQuoteMap(pdf,document(pdf).extraction),section={start:0,end:pdf.length,text:pdf};
 for(const quote of ['I Signed the north lease.','I never signed the north lease.','I signed the north lease!'])assert.throws(()=>groundPdfClaim(claim(quote),pdf,map,section),/grounded/);
 const repeated=pdf+'\n'+pdf,m=pdfQuoteMap(repeated,{pages:[{start:0,end:pdf.length},{start:pdf.length+1,end:repeated.length}]});
 assert.throws(()=>groundPdfClaim(claim('I signed the north lease.'),repeated,m,{start:0,end:repeated.length,text:repeated}),/more than one/);
 assert.throws(()=>groundPdfClaim(claim('I signed the north lease.'),pdf,map,{start:pdf.indexOf('4 Q'),end:pdf.length,text:pdf.slice(pdf.indexOf('4 Q'))}),/grounded/);
});
test('isolated numeric evidence and standalone time values are not stripped',()=>{
 const text='Q: What did you count?\nA: 12 people arrived at 11:00:00.\n25 dollars remained.';
 assert.equal(pdfQuoteMap(text,document(text).extraction).normalized,'Q: What did you count? A: 12 people arrived at 11:00:00. 25 dollars remained.');
});
test('one rejected finding retains the valid one but gives partial coverage, not complete',async()=>{
 const texts=['Q: Did you sign?\nA: I signed the lease.','Q: Did you sign?\nA: I never signed the lease.'];
 const valid=candidate('I signed the lease.','I never signed the lease.');
 const result=await executePlan({plan:buildPlan(texts,[],'rules'),texts,instructions:'rules',callModel:async()=>message([valid,candidate('Invented words.','I never signed the lease.')])});
 assert.equal(result.contradictions.length,1);assert.equal(result.analysis.status,'partial');assert.equal(result.analysis.partial,1);
 assert.equal(result.analysis.completed,0);assert.equal(result.analysis.coverage[0].sections[0].status,'partial');
 assert.equal(result.analysis.tasks[0].rejectedFindings.length,1);assert.equal(result.analysis.tasks[0].acceptedFindings,1);
 assert.equal(result.analysis.tasks[0].response.contradictions.length,2);
 assert.equal(result.analysis.tasks[0].stopReason,'end_turn');assert.equal(result.analysis.tasks[0].usage.thinking_tokens,40);
});
test('PDF restoration reaches existing source validation and retains original page citations',async()=>{
 const other='Q: Did you sign?\nA: I never signed the north lease.',texts=[pdf,other];
 const result=await executePlan({plan:buildPlan(texts,[document(pdf)],'rules'),texts,instructions:'rules',callModel:async()=>message([candidate('I signed the north lease.','I never signed the north lease.')])});
 assert.equal(result.analysis.failed,0);assert.equal(result.contradictions[0].claim1Valid,true);
 assert.equal(result.contradictions[0].sourceReferences.claim1[0].pdfPage,1);
 assert.equal(result.contradictions[0].sourceReferences.claim1[0].pageLabel,'42');
 assert.equal(result.contradictions[0].sourceGrounding.claim1.method,'PDF_LAYOUT_MAPPED');
 assert.equal(result.analysis.tasks[0].response.contradictions[0].claim1.original,'I signed the north lease.');
});
test('short budget preserved; sectioned budget and preview costs account for thinking and actual request settings',async()=>{
 const texts=['Q: Did you sign?\nA: Yes.','Q: Did you sign?\nA: No.'];
 const short=buildPlan(texts,[],'rules'),long=buildPlan(texts,[],'rules',{singleRequestBytes:1});
 assert.equal(short.outputTokens,OUTPUT_TOKENS);assert.equal(long.outputTokens,SECTION_OUTPUT_TOKENS);
 assert.equal(long.cost.outputTokensPerRequest,SECTION_OUTPUT_TOKENS);assert.match(long.cost.note,/32,000 including thinking/);
 let calls=0;
 const result=await executePlan({plan:long,texts,instructions:'rules',callModel:async (params,options)=>{calls++;assert.equal(options.timeout,600000);assert.equal(options.maxRetries,0);assert.equal(params.max_tokens,SECTION_OUTPUT_TOKENS);return {...message([]),stop_reason:'max_tokens',content:[]};}});
 assert.equal(calls,1);assert.equal(result.analysis.status,'failed');assert.equal(result.analysis.tasks[0].stopReason,'max_tokens');
 assert.equal(result.analysis.tasks[0].outputTokenLimit,SECTION_OUTPUT_TOKENS);assert.equal(result.contradictions.length,0);
});

test('layout recovery cannot promote an examiner question into witness evidence',async()=>{
 const text='1 Q I signed the 10:00:00\n2 north lease. 10:00:01\n3 A That is your claim. 10:00:02\n4 Q Did you sign? 10:00:03\n5 A No. 10:00:04',other='Q: Did you sign?\nA: I never signed the north lease.';
 const result=await executePlan({plan:buildPlan([text,other],[document(text)],'rules'),texts:[text,other],instructions:'rules',callModel:async()=>message([candidate('I signed the north lease.','I never signed the north lease.')])});
 assert.equal(result.contradictions[0].claim1Valid,false);assert.equal(result.contradictions[0].score,null);assert.equal(result.analysis.status,'partial');
});

test('confirmed repeated page furniture maps a continued answer across a PDF boundary without changing words',async()=>{
 const pageTexts=[
 '1 CONFIDENTIAL - SAMPLE WITNESS\n2 Q Describe the decision.\n3 A The price was high.\n4 More detail.\nPage 10\nReporting Company\n123-456-7890\nFILED: Court filing',
 '1 CONFIDENTIAL - SAMPLE WITNESS\n2 I agreed to lower it.\n3 Q Why?\n4 A It needed review.\nPage 11\nReporting Company\n123-456-7890\nFILED: Court filing',
 '1 CONFIDENTIAL - SAMPLE WITNESS\n2 Q Anything else?\n3 A No.\n4 Q Finished?\n5 A Yes.\nPage 12\nReporting Company\n123-456-7890\nFILED: Court filing'];
 // The contiguous comparison crosses only reporting metadata, not More detail.
 pageTexts[0]=pageTexts[0].replace('3 A The price was high.\n4 More detail.','3 Q What happened then?\n4 A The price was high.');
 let offset=0;const pages=pageTexts.map((text,i)=>{if(i)offset+=2;const p={pdfPage:i+1,pageLabel:String(i+10),start:offset,end:offset+text.length,status:'TEXT'};offset=p.end;return p;});
 const text=pageTexts.join('\n\n'),extraction={textSha256:digest(text),textLength:text.length,pageCount:3,pages};
 const got=groundPdfClaim(claim('The price was high. I agreed to lower it.'),text,pdfQuoteMap(text,extraction),{start:0,end:text.length,text});
 assert.equal(got.audit.method,'PDF_LAYOUT_MAPPED');assert.match(got.claim.original,/Page 10/);assert.match(got.claim.original,/CONFIDENTIAL/);
 assert.equal(text.slice(got.audit.start,got.audit.end),got.claim.original);
 const unique={...extraction,pages:pages.slice(0,2)};
 assert.throws(()=>groundPdfClaim(claim('The price was high. I agreed to lower it.'),text,pdfQuoteMap(text,unique),{start:0,end:text.length,text}),/grounded/);
});
