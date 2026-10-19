import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPdfReport,reportCounts,reportSelection,REPORT_SCOPES} from './pdfReport.js';

// Fictional findings only.
const f=(type,extra={})=>({type,headline:`${type} pair`,typeRule:'Direct conflict: affirm vs deny.',reasoning:'They clash. Follow-up: Which day was it?',claim1:{original:'I signed.'},claim2:{original:'I did not sign.'},...extra});
const findings=[f('FALSE_POSITIVE'),f('INFERENTIAL',{humanConfidence:40}),f('DIRECT',{humanConfidence:80}),f('DIRECT',{labelDisagreement:true}),f('DIRECT',{humanConfidence:90})];

test('counts every kind and treats disagreements as uncertain',()=>{
 assert.deepEqual(reportCounts(findings),{DIRECT:2,INFERENTIAL:1,UNCERTAIN:1,FALSE_POSITIVE:1});
});
test('each option selects the right findings, strongest first',()=>{
 assert.deepEqual(reportSelection(findings,'contradictions').map(x=>x.index),[4,2,1,3]);
 assert.deepEqual(reportSelection(findings,'direct').map(x=>x.index),[4,2]);
 assert.deepEqual(reportSelection(findings,'dismissed').map(x=>x.index),[0]);
 assert.equal(reportSelection(findings,'everything').length,5);
 assert.equal(REPORT_SCOPES.length,6);
});
test('the report shows the totals, only the chosen findings, notes on request, and escapes text',()=>{
 const draft={results:[...findings,f('DIRECT',{claim1:{original:'<script>x()</script>'}})],notes:{2:'Ask about the lease.'},reviewed:{2:true},files:[{name:'a.pdf',extraction:{pageCount:16}},null]};
 const html=buildPdfReport({title:'Case <A>',draft,options:{scope:'direct'},generatedAt:'2026-10-18T12:00:00Z'});
 assert.match(html,/<b>4<\/b><span>contradictions found/);
 assert.match(html,/This report shows: <b>Direct only<\/b> \(3\)/);
 assert.doesNotMatch(html,/FALSE_POSITIVE pair/);assert.match(html,/Ask about the lease\./);assert.match(html,/✓ Reviewed/);
 assert.match(html,/Which day was it\?/);assert.match(html,/a\.pdf \(16 pages\)/);
 assert.ok(!html.includes('<script>x()'));assert.match(html,/Case &lt;A&gt;/);
 assert.doesNotMatch(buildPdfReport({draft,options:{scope:'direct',notes:false}}),/Ask about the lease/);
});
