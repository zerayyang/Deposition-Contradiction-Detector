import {pdfReportingRanges} from './pdfReporting.js';
// An offset map, not a fuzzy matcher. Only repeated PDF reporting furniture is
// removed. No case folding, punctuation changes, synonyms, or word correction.
export function pdfQuoteMap(text, manifest) {
  const ignored = new Uint8Array(text.length);
  for(const range of pdfReportingRanges(text,manifest?.pages))ignored.fill(1,range.start,range.end);
  const pages=(manifest?.pages??[]).map(page=>({...page,lines:[...text.slice(page.start,page.end).matchAll(/[^\n]+/g)].map(m=>({text:m[0],start:page.start+m.index}))}));
  const headerCounts=new Map(),footerCounts=new Map();
  for(const page of pages){
    const first=page.lines[0]?.text.replace(/^\s*(?:[1-9]|1\d|2[0-5])\s+/,'').trim();
    if(first&&/^(?:CONFIDENTIAL(?:\s|$)|.*\s-\sby\s|Proceedings$)/i.test(first)){
      page.header=first;headerCounts.set(first,(headerCounts.get(first)??0)+1);
    }
    const at=page.lines.findLastIndex((line,index)=>index>=page.lines.length-9&&/^Page \d+\s*$/.test(line.text.trim()));
    if(at>=0&&page.lines.length-at>=4){
      const tail=page.lines.slice(at+1).map(l=>l.text.trim()).filter(Boolean);
      if(!tail.some(l=>/^(?:\d{1,2}\s+)?[QA][.:]?\s/.test(l))){
        page.footer={at,signature:tail.join('\n')};
        footerCounts.set(page.footer.signature,(footerCounts.get(page.footer.signature)??0)+1);
      }
    }
  }
  for (const page of pages) {
    const lines=page.lines;
    if(page.header&&headerCounts.get(page.header)>=3)ignored.fill(1,lines[0].start,lines[0].start+lines[0].text.length);
    if(page.footer&&footerCounts.get(page.footer.signature)>=3)ignored.fill(1,lines[page.footer.at].start,page.end);
    const numbered = lines.flatMap(line=>{
      const match=line.text.match(/^(\s*)([1-9]|1\d|2[0-5])\s+/);
      return match ? [{...line,number:Number(match[2]),prefix:match[0].length}] : [];
    });
    const confirmed = new Set();
    for(let start=0;start<numbered.length;){
      let end=start+1;
      while(end<numbered.length&&numbered[end].number===numbered[end-1].number+1)end++;
      if(end-start>=4)for(let i=start;i<end;i++)confirmed.add(numbered[i]);
      start=end;
    }
    const remove=(start,end)=>ignored.fill(1,start,end);
    for(const line of confirmed)remove(line.start,line.start+line.prefix);
    const stamp=/\b(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*$/;
    // A single clock value is testimony, not automatically a reporting timestamp.
    const stamped=[...confirmed].filter(line=>stamp.test(line.text));
    if(stamped.length>=4){
      for(const line of stamped){const m=line.text.match(stamp);remove(line.start+m.index,line.start+line.text.length);}
      for(const line of lines)if(/^\s*(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*$/.test(line.text))remove(line.start,line.start+line.text.length);
    }
  }
  let normalized='';const starts=[],ends=[];
  for(let i=0;i<text.length;i++){
    if(ignored[i])continue;
    if(/\s/.test(text[i])){
      if(!normalized)continue;
      if(normalized.endsWith(' ')){ends[ends.length-1]=i+1;continue;}
      normalized+=' ';
    }else normalized+=text[i];
    starts.push(i);ends.push(i+1);
  }
  if(normalized.endsWith(' ')){normalized=normalized.slice(0,-1);starts.pop();ends.pop();}
  return {normalized,starts,ends};
}
// Pasted transcripts carry the same reporting layout as PDFs, but without page boundaries:
// lines repeated 3+ times (running headers, reporter initials, stamps), bare page-number lines,
// confirmed runs of line numbers and confirmed runs of trailing clock stamps are skipped.
// Like the PDF map, this is an offset map, not a fuzzy matcher: every other character must match.
export function textQuoteMap(text) {
  const lines=[...text.matchAll(/[^\n]+/g)].map(m=>({text:m[0],start:m.index}));
  const counts=new Map();
  for(const line of lines){const key=line.text.trim();if(key)counts.set(key,(counts.get(key)??0)+1);}
  const ignored=new Uint8Array(text.length),remove=(start,end)=>ignored.fill(1,start,end);
  for(const line of lines){
    const key=line.text.trim();
    const furniture=counts.get(key)>=3&&key.length<=90&&!/^(?:\d{1,2}\s+)?(?:Q|A)\b[.:]?/.test(key);
    if(furniture||/^\d{3,5}$/.test(key))remove(line.start,line.start+line.text.length);
  }
  const numbered=lines.flatMap(line=>{const m=line.text.match(/^(\s*)([1-9]|1\d|2[0-5])\s+/);return m?[{...line,number:Number(m[2]),prefix:m[0].length}]:[];});
  const confirmed=[];
  for(let start=0;start<numbered.length;){
    let end=start+1;
    while(end<numbered.length&&numbered[end].number===numbered[end-1].number+1)end++;
    if(end-start>=4)confirmed.push(...numbered.slice(start,end));
    start=end;
  }
  for(const line of confirmed)remove(line.start,line.start+line.prefix);
  const stamp=/\s(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*$/,stamped=lines.filter(line=>stamp.test(line.text));
  if(stamped.length>=4)for(const line of stamped){const m=line.text.match(stamp);remove(line.start+m.index,line.start+line.text.length);}
  let normalized='';const starts=[],ends=[];
  for(let i=0;i<text.length;i++){
    if(ignored[i])continue;
    if(/\s/.test(text[i])){
      if(!normalized)continue;
      if(normalized.endsWith(' ')){ends[ends.length-1]=i+1;continue;}
      normalized+=' ';
    }else normalized+=text[i];
    starts.push(i);ends.push(i+1);
  }
  if(normalized.endsWith(' ')){normalized=normalized.slice(0,-1);starts.pop();ends.pop();}
  return {normalized,starts,ends};
}
const normalize=quote=>quote.replace(/\s+/g,' ').trim();
export function groundPdfClaim(claim,text,map,section,method='PDF_LAYOUT_MAPPED') {
  if(typeof claim?.original!=='string'||!claim.original.trim())throw new Error('A returned quotation is missing.');
  const modelOriginal=claim.original,exact=section.text.includes(modelOriginal);
  if(exact)return {claim:{...claim},audit:{method:'EXACT',modelOriginal,sourceOriginal:modelOriginal}};
  const needle=normalize(modelOriginal),matches=[];
  for(let pos=map.normalized.indexOf(needle);pos>=0;pos=map.normalized.indexOf(needle,pos+1)){
    const start=map.starts[pos],end=map.ends[pos+needle.length-1];
    if(start>=section.start&&end<=section.end)matches.push({start,end,pos});
    if(matches.length>1)break;
  }
  if(matches.length!==1)throw new Error(matches.length?(method==='PDF_LAYOUT_MAPPED'?'PDF quotation matches more than one source passage.':'A returned quotation matches more than one source passage.'):method==='PDF_LAYOUT_MAPPED'?'A returned quotation cannot be grounded in its submitted PDF section.':'A returned quotation is outside its submitted section.');
  const match=matches[0],sourceOriginal=text.slice(match.start,match.end),restored={...claim,original:sourceOriginal};
  const fields=['activityPhrase','timePhrase','locationPhrase','personPhrase','objectPhrase','quantityPhrase','statePhrase'];
  const restore=phrase=>{
    if(phrase===null||typeof phrase!=='string'||!phrase.trim())return phrase;
    // Unsupported model extractions remain unchanged and will fail validation.
    if(sourceOriginal.includes(phrase))return phrase;
    const value=normalize(phrase),within=map.normalized.slice(match.pos,match.pos+needle.length),at=within.indexOf(value);
    return at<0?phrase:text.slice(map.starts[match.pos+at],map.ends[match.pos+at+value.length-1]);
  };
  for(const key of fields)restored[key]=restore(restored[key]);
  if(Array.isArray(restored.qualifierPhrases))restored.qualifierPhrases=restored.qualifierPhrases.map(restore);
  return {claim:restored,audit:{method,modelOriginal,sourceOriginal,start:match.start,end:match.end,notice:'Reporting layout was mapped to the exact original source span; model wording retained for audit.'}};
}
