import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewReport,reportGroups,openReviewReport} from './reviewReport.js';
const finding={type:'DIRECT',reasoning:'Opposite assertions.',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'},status:'CONFLICT_SUPPORTED',score:90,band:'STRONG',sourceReferences:{claim1:[{pdfPage:2,pageLabel:'30',start:1,end:10}],claim2:[{pdfPage:4,pageLabel:'40',start:20,end:40}]}};
test('report includes every type, code score and full original quotations/citations',()=>{
 const html=buildReviewReport({title:'Example',draft:{results:[finding,{...finding,type:'INFERENTIAL',score:null,status:'NOT_EVALUABLE'},{...finding,type:'FALSE_POSITIVE',score:null,status:'NOT_EVALUABLE'}],analysis:{status:'complete'},notes:{0:'Check original.'}}});
 assert.match(html,/1 direct/);assert.match(html,/1 inferential/);assert.match(html,/1 false positive/);assert.match(html,/90 \/ 100/);assert.match(html,/PDF page 2 \(label 30\)/);assert.match(html,/I did not sign\./);assert.match(html,/Check original\./);assert.match(html,/No numeric score/);
});
test('partial coverage and rejected findings remain visible without promoting rejected labels',()=>{
 const html=buildReviewReport({draft:{results:[finding],analysis:{status:'partial',coverage:[{document:1,pageCount:2,pages:[{analysisStatus:'complete'},{analysisStatus:'partial'}]}],tasks:[{id:'0:0',status:'partial',acceptedFindings:1,rejectedFindings:[{candidateIndex:1,candidate:{...finding,claim1:{original:'Unverified words'}},reason:'Source mismatch'}]}]}}});
 assert.match(html,/INCOMPLETE REVIEW/);assert.match(html,/1 of 2 PDF pages fully compared/);assert.match(html,/Unverified — excluded/);assert.match(html,/Unverified words/);assert.match(html,/1 direct/);assert.match(html,/1 rejected/);
});
test('duplicates group only identical source locations; all explanations retained',()=>{
 const items=[finding,{...finding,reasoning:'Second interpretation.'},{...finding,sourceReferences:{claim1:[{pdfPage:9}]}}];
 assert.equal(reportGroups(items).length,2);const html=buildReviewReport({draft:{results:items}});
 assert.match(html,/Second interpretation/);assert.match(html,/Other 1 observations/);assert.match(html,/Finding 3/);
});
test('case data cannot inject executable HTML or close the embedded JSON script',()=>{
 const attack='</script><script>alert("x")</script><img src=x onerror=alert(1)>';
 const html=buildReviewReport({title:attack,draft:{results:[{...finding,reasoning:attack}],texts:[attack,'other']}});
 assert.doesNotMatch(html,/<script>alert|<img src=x/);assert.match(html,/&lt;\/script&gt;/);
 const payload=html.match(/<script type="application\/json" id="snapshot">([\s\S]*?)<\/script>/)[1];
 assert.equal(JSON.parse(payload).transcript1,attack);
});
test('legacy and unknown categories never masquerade as a complete empty review',()=>{
 const html=buildReviewReport({draft:{results:[{...finding,type:'UNKNOWN'}]}});
 assert.match(html,/Coverage unavailable/);assert.match(html,/Unrecognized categories/);assert.match(html,/Finding 1/);
});
test('opening a report uses only existing data and handles blocked pop-ups',()=>{
 let text='';const tab={opener:'parent',document:{open(){},write(value){text=value;},close(){}}};
 openReviewReport({title:'Example',draft:{results:[]}},{open:()=>tab});assert.equal(tab.opener,null);assert.match(text,/Example/);
 assert.throws(()=>openReviewReport({draft:{}},{open:()=>null}),/blocked/);
});
test('bound questions and full answers render safely; multi-page one occurrence is not called ambiguous',()=>{
 const binding={status:'BOUND',eligibleCount:1,selected:{start:1,end:10,question:'Was <this> signed?',answer:'Yes. I signed it.'}};
 const html=buildReviewReport({draft:{results:[{...finding,sourceBindings:{claim1:binding,claim2:binding},sourceReferences:{claim1:[{pdfPage:2},{pdfPage:3}],claim2:[{pdfPage:4}]}}]}});
 assert.match(html,/Was &lt;this&gt; signed/);assert.match(html,/Yes\. I signed it\./);assert.match(html,/One witness occurrence located/);
 assert.doesNotMatch(html,/Multiple source locations/);
});
test('unresolved and legacy bindings remain explicitly distinct from located evidence',()=>{
 const html=buildReviewReport({draft:{results:[{...finding,sourceBindings:{claim1:{status:'AMBIGUOUS',eligibleCount:2,selected:null}}}]}});
 assert.match(html,/Source occurrence unresolved \(AMBIGUOUS\)/);assert.match(html,/2 eligible witness occurrences/);assert.match(html,/Older result: no occurrence-specific source binding/);
});
