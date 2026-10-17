// Held-out author assembly: prints aggregate counts only, never identities/keys.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {shingleCoverage} from './fidelity.mjs';
import {priorOverlap,canonicalCaseName} from './identity.mjs';
const root=new URL('./',import.meta.url),index=JSON.parse(await fs.readFile(new URL('research/excluded-opinions.json',root),'utf8'));
const rows=[],excluded=[],opinions=new Map(),ids=new Set();
for(const part of ['a','b','c']){
 const batch=JSON.parse(await fs.readFile(new URL(`research/part-${part}.json`,root),'utf8'));
 for(const record of batch){
  const r=structuredClone(record),p=r.provenance??{};
  if(priorOverlap(r,index)){excluded.push({id:r.id,reason:'Prior opinion/matter overlap'});continue;}
  if(p.eligible===false){excluded.push({id:r.id,reason:p.exclusionReason??'Author source verification failed'});continue;}
  if(ids.has(r.id))throw new Error('Duplicate opaque case ID');
  const opinion=p.opinionId??canonicalCaseName(r.source);
  if(!opinion)throw new Error('Opinion identity missing');
  const n=opinions.get(opinion)??0;if(n>=2){excluded.push({id:r.id,reason:'Maximum two cases per opinion'});continue;}
  const file=p.coverageSourceFile;
  if(typeof file!=='string'||file.includes('..')||!file.startsWith('research/'))throw new Error('Missing local source capture');
  const source=await fs.readFile(new URL(file,root),'utf8');
  const coverage=[shingleCoverage(r.quote1,source),shingleCoverage(r.quote2,source)];
  if(coverage.some(c=>c<0.9)){excluded.push({id:r.id,reason:'Five-word shingle coverage below fixed threshold'});continue;}
  p.quote1ShingleCoverage=coverage[0];p.quote2ShingleCoverage=coverage[1];
  p.coverageSourceSha256=createHash('sha256').update(source).digest('hex');
  if(p.quote1Verbatim!==true||p.quote2Verbatim!==true){excluded.push({id:r.id,reason:'Literal source verification not affirmative'});continue;}
  r.split='heldout';r.reviewStatus='draft';r.sourceFamily='judicial-sham';r.splitGroup=opinion;r.provenance=p;
  rows.push(r);ids.add(r.id);opinions.set(opinion,n+1);
 }
}
if(!rows.length)throw new Error('No verified fresh cases available');
// Balanced selection is fixed before any model run. Rank opaque IDs by a public
// seed; never use detector output or anticipated difficulty to select cases.
const selectionSeed='fresh-heldout-20261017-v1';
const selected=new Set();
for(const label of ['DIRECT','FALSE_POSITIVE','INFERENTIAL','DEBATABLE']){
 const group=rows.filter(r=>r.label===label).sort((a,b)=>{
  const rank=r=>createHash('sha256').update(selectionSeed+':'+r.id).digest('hex');
  return rank(a).localeCompare(rank(b));
 });
 const limit=['DIRECT','FALSE_POSITIVE'].includes(label)?20:group.length;
 for(const r of group.slice(0,limit))selected.add(r.id);
 for(const r of group.slice(limit))excluded.push({id:r.id,reason:'Verified reserve: deterministic pre-evaluation balance cap'});
}
rows.splice(0,rows.length,...rows.filter(r=>selected.has(r.id)));
const finalOpinionCounts=new Map();for(const r of rows)finalOpinionCounts.set(r.splitGroup,(finalOpinionCounts.get(r.splitGroup)??0)+1);
rows.sort((a,b)=>a.id.localeCompare(b.id));
const inputs=rows.map(({id,split,transcript1,transcript2})=>({id,split,transcript1,transcript2}));
const references=rows.map(({transcript1:_a,transcript2:_b,...r})=>r);
for(const [name,data]of [['cases.json',rows],['inputs.json',inputs],['reference-findings.json',references]])await fs.writeFile(new URL(name,root),JSON.stringify(data,null,2)+'\n');
const sha=async name=>createHash('sha256').update(await fs.readFile(new URL(name,root))).digest('hex');
const manifest={cases:rows.length,opinions:finalOpinionCounts.size,byLabel:Object.fromEntries(['DIRECT','FALSE_POSITIVE','INFERENTIAL','DEBATABLE'].map(label=>[label,rows.filter(r=>r.label===label).length])),split:'heldout',selectionPolicy:{seed:selectionSeed,maxPerDefiniteLabel:20,rule:'Deterministic hash rank before any model evaluation; verified extras remain sealed research reserves.'},excluded,oldOpinionOverlap:0,maxCasesPerOpinion:Math.max(...finalOpinionCounts.values()),minimumQuoteShingleCoverage:Math.min(...rows.flatMap(r=>[r.provenance.quote1ShingleCoverage,r.provenance.quote2ShingleCoverage])),inputsSha256:await sha('inputs.json'),referencesSha256:await sha('reference-findings.json'),casesSha256:await sha('cases.json'),exclusionsSha256:await sha('research/excluded-opinions.json'),approval:'Draft external-source expectations; no promotion or model accuracy measured.'};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({cases:manifest.cases,opinions:manifest.opinions,byLabel:manifest.byLabel,excluded:excluded.length,minimumCoverage:manifest.minimumQuoteShingleCoverage,overlap:0}));
