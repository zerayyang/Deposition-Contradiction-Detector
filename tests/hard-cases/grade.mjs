#!/usr/bin/env node
// Grades a saved hard-case run against the draft reference labels. Local only:
// reads results.json from run.mjs and reference-findings.json; never calls a model.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// The strongest label the detector raised for a case; no flagged pair means FALSE_POSITIVE.
export function predictedLabel(labels=[]){
 const types=new Set(labels.map(l=>l.type));
 return types.has('DIRECT')?'DIRECT':types.has('INFERENTIAL')?'INFERENTIAL':'FALSE_POSITIVE';
}
export function gradeRun(results,references){
 const byId=new Map(references.map(r=>[r.id,r])),rows=[];
 for(const s of results.summaries??[]){
  if(!['direct','comparison'].includes(s.phase))continue;
  const ref=byId.get(s.id);if(!ref)continue;
  const predicted=predictedLabel(s.labels);
  const complete=['complete','completed'].includes(s.status);
  rows.push({id:s.id,attempt:s.attempt,expected:ref.label,predicted,complete,
   correct:ref.label==='DEBATABLE'||!complete?null:predicted===ref.label});
 }
 const graded=rows.filter(r=>r.correct!==null),count=(rs,f)=>rs.filter(f).length;
 const by=label=>{const rs=graded.filter(r=>r.expected===label);return {cases:rs.length,correct:count(rs,r=>r.correct)};};
 return {rows,summary:{graded:graded.length,correct:count(graded,r=>r.correct),
  DIRECT:by('DIRECT'),INFERENTIAL:by('INFERENTIAL'),FALSE_POSITIVE:by('FALSE_POSITIVE'),
  missedContradictions:count(graded,r=>r.expected==='DIRECT'&&r.predicted==='FALSE_POSITIVE'),
  falseAlarms:count(graded,r=>r.expected==='FALSE_POSITIVE'&&r.predicted!=='FALSE_POSITIVE'),
  incomplete:count(rows,r=>!r.complete),
  debatable:rows.filter(r=>r.expected==='DEBATABLE').map(r=>({id:r.id,predicted:r.predicted}))},
  note:'Draft reference labels from court rulings; not approved gold. Debatable and incomplete cases are not graded.'};
}
async function main(){
 const file=process.argv[2];if(!file)throw new Error('Usage: node tests/hard-cases/grade.mjs <results.json>');
 const results=JSON.parse(await fs.readFile(file,'utf8'));
 const references=JSON.parse(await fs.readFile(new URL('./reference-findings.json',import.meta.url),'utf8'));
 const {rows,summary,note}=gradeRun(results,references);
 for(const r of rows.filter(r=>r.correct===false))console.log(`WRONG ${r.id}: expected ${r.expected}, got ${r.predicted}`);
 console.log(JSON.stringify({summary,note},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
