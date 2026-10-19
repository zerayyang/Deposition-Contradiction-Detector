import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSummaryReport,openSummaryPdfReport} from './summaryReport.js';
const finding={type:'DIRECT',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'},reasoning:'Opposite statements. More detail.',sourceReferences:{claim1:[{pdfPage:2,pageLabel:'20'}]},hybridConfidence:{version:'hybrid-confidence-v1',originalType:'DIRECT',status:'EXPERIMENTAL',score:90}};
test('short report keeps key quotes, sources, hybrid score and notes but excludes technical payloads',()=>{
  const html=buildSummaryReport({title:'Example',draft:{results:[finding,{...finding,type:'FALSE_POSITIVE',claim1:{original:'COMPATIBLE_DETAIL'}}],analysis:{status:'complete',tasks:[{rawText:'PRIVATE_DEBUG'}]},texts:['FULL_TRANSCRIPT','OTHER'],notes:{0:'Ask for clarification'}}});
  for(const text of ['I signed.','I did not sign.','PDF page 2','90%','Ask for clarification','1 potential contradiction'])assert.ok(html.includes(text));
  assert.doesNotMatch(html,/PRIVATE_DEBUG|FULL_TRANSCRIPT|COMPATIBLE_DETAIL|More detail\./);
});
test('incomplete and absent coverage never claim a complete review',()=>{
  assert.match(buildSummaryReport({draft:{results:[],analysis:{status:'partial'}}}),/Incomplete review/);
  assert.match(buildSummaryReport({draft:{results:[]}}),/Incomplete review/);
});
test('report escapes user text and leaves quotations untruncated',()=>{
  const quote='X'.repeat(800);const html=buildSummaryReport({title:'<img onerror=attack>',draft:{results:[{...finding,claim1:{original:quote}}]}});
  assert.doesNotMatch(html,/<img/);assert.ok(html.includes(quote));
});
test('PDF action uses browser print without API calls and reports blocked pop-ups',()=>{
  let printed=0,written='';const tab={document:{open(){},write(v){written=v;},close(){}},print(){printed++;}};
  openSummaryPdfReport({title:'Example'},{open:()=>tab});assert.equal(printed,1);assert.match(written,/Example/);assert.equal(tab.opener,null);
  assert.throws(()=>openSummaryPdfReport({}, {open:()=>null}),/Allow pop-ups/);
});
