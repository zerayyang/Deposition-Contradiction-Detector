// An offset map, not a fuzzy matcher. Only repeated PDF reporting furniture is
// removed. No case folding, punctuation changes, synonyms, or word correction.
export function pdfQuoteMap(text, manifest) {
  const ignored = new Uint8Array(text.length);
  for (const page of manifest?.pages ?? []) {
    const lines = [...text.slice(page.start,page.end).matchAll(/[^\n]+/g)].map(m=>({text:m[0],start:page.start+m.index}));
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
const normalize=quote=>quote.replace(/\s+/g,' ').trim();
export function groundPdfClaim(claim,text,map,section) {
  if(typeof claim?.original!=='string'||!claim.original.trim())throw new Error('A returned quotation is missing.');
  const modelOriginal=claim.original,exact=section.text.includes(modelOriginal);
  if(exact)return {claim:{...claim},audit:{method:'EXACT',modelOriginal,sourceOriginal:modelOriginal}};
  const needle=normalize(modelOriginal),matches=[];
  for(let pos=map.normalized.indexOf(needle);pos>=0;pos=map.normalized.indexOf(needle,pos+1)){
    const start=map.starts[pos],end=map.ends[pos+needle.length-1];
    if(start>=section.start&&end<=section.end)matches.push({start,end,pos});
    if(matches.length>1)break;
  }
  if(matches.length!==1)throw new Error(matches.length?'PDF quotation matches more than one source passage.':'A returned quotation cannot be grounded in its submitted PDF section.');
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
  return {claim:restored,audit:{method:'PDF_LAYOUT_MAPPED',modelOriginal,sourceOriginal,start:match.start,end:match.end,notice:'Reporting layout was mapped to the exact original source span; model wording retained for audit.'}};
}
