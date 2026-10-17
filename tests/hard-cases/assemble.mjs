// Local assembly only: never imports application code, approved gold or reports.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),names=['sham-a','sham-b','famous','datasets'];
const rows=[],missing=[],duplicates=[],excluded=[],seen=new Set();
for(const name of names){
 let records;
 try{records=JSON.parse(await fs.readFile(new URL(`research/${name}.json`,root),'utf8'));}
 catch(error){if(error.code==='ENOENT'){missing.push(name);continue;}throw error;}
 if(!Array.isArray(records))throw new Error('Source collection must be an array.');
 for(const original of records){
  if(original.provenance?.hardCasePageRequirementSatisfied===false){excluded.push({id:original.id,reason:original.provenance.exclusionReason??'Quotation/ruling page pinpoints not verified; retained in source research only.'});continue;}
  if(original.provenance?.independentVerification?.keep!==true){excluded.push({id:original.id,reason:original.provenance?.independentVerification?.reason??'Independent source review not completed.'});continue;}
  const key=createHash('sha256').update(JSON.stringify([original.quote1,original.quote2].map(q=>q.replace(/\s+/g,' ').trim()))).digest('hex');
  if(seen.has(key)){duplicates.push(original.id);continue;}seen.add(key);
  rows.push({...original,sourceFamily:name.startsWith('sham')?'judicial-sham':name==='famous'?'famous-debatable':'research-dataset',reviewStatus:'draft'});
 }
}
if(!rows.length)throw new Error('No source-authored cases available.');
if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate case IDs; author review required.');
const groupKey=r=>r.sourceFamily==='research-dataset'
 ?`${new URL(r.sourceUrl).href.split('#')[0]}::document:${r.provenance.documentId}`
 :new URL(r.sourceUrl).href.split('#')[0];
const groups=Object.values(Object.groupBy(rows,groupKey));
const labels=[...new Set(rows.map(r=>r.label))],families=[...new Set(rows.map(r=>r.sourceFamily))];
const count=(list,field,value)=>list.filter(r=>r[field]===value).length;
const score=list=>Math.abs(list.length-rows.length/2)*2+
 labels.reduce((n,label)=>n+Math.abs(count(list,'label',label)-count(rows,'label',label)/2),0)+
 families.reduce((n,family)=>n+Math.abs(count(list,'sourceFamily',family)-count(rows,'sourceFamily',family)/2),0);
let best=null;
// Seeded deterministic search; group the same public source document together.
for(let seed=0;seed<4096;seed++){
 const selected=groups.filter(g=>parseInt(createHash('sha256').update(seed+':'+groupKey(g[0])).digest('hex').slice(0,8),16)%2===0).flat();
 if(!selected.length||selected.length===rows.length)continue;
 const value=score(selected);if(!best||value<best.value)best={value,keys:new Set(selected.map(groupKey))};
}
if(!best)throw new Error('At least two independent source documents are needed for heldout isolation.');
for(const r of rows){r.split=best.keys.has(groupKey(r))?'heldout':'tuning';r.splitGroup=groupKey(r);}
rows.sort((a,b)=>a.id.localeCompare(b.id));
const inputs=rows.map(({id,split,transcript1,transcript2})=>({id,split,transcript1,transcript2}));
const references=rows.map(({transcript1:_one,transcript2:_two,...reference})=>reference);
await fs.writeFile(new URL('cases.json',root),JSON.stringify(rows,null,2)+'\n');
await fs.writeFile(new URL('inputs.json',root),JSON.stringify(inputs,null,2)+'\n');
await fs.writeFile(new URL('reference-findings.json',root),JSON.stringify(references,null,2)+'\n');
const counts=field=>Object.fromEntries([...new Set(rows.map(r=>r[field]))].map(value=>[value,count(rows,field,value)]));
const metadata={total:rows.length,byLabel:counts('label'),bySourceFamily:counts('sourceFamily'),bySplit:counts('split'),
 sources:Object.keys(Object.groupBy(rows,r=>r.sourceUrl)).length,
 bySource:counts('source'),
 bySplitLabel:Object.fromEntries(['tuning','heldout'].map(split=>[split,Object.fromEntries(labels.map(label=>[label,rows.filter(r=>r.split===split&&r.label===label).length]))])),
 splitPolicy:'Deterministic approximate balance by count, label and family, grouped by source opinion/proceeding URL or original dataset document ID. No source group crosses splits.',
 missingCollections:missing,duplicateIdsExcluded:duplicates,excludedResearchRecords:excluded,approval:'All draft; none promoted or human-approved.'};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));
