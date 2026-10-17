// Public source metadata only. No testimony or classification is needed to
// compare matters conservatively; repeated matters are excluded, not just URLs.
export const canonicalUrl=value=>decodeURIComponent(new URL(value).href).split('#')[0].replace(/^https?:\/\/(?:www\.)?/,'').replace(/\/$/,'').toLowerCase();
export const canonicalCaseName=value=>String(value).split(',')[0].replace(/\([^)]*\)/g,'').toLowerCase().replace(/\b(?:versus|vs)\.?\b/g,'v').replace(/[^a-z0-9]/g,'');
export const canonicalDocket=value=>String(value).toLowerCase().replace(/\b(?:case|no|number)\b\.?/g,'').replace(/\b(19|20)(\d{2})(?=[-:])/g,'$2').replace(/\b0+(\d+)/g,'$1').replace(/[^a-z0-9]/g,'');
export function priorOverlap(record,index){
 const url=canonicalUrl(record.sourceUrl),name=canonicalCaseName(record.provenance?.caseName??record.source),docket=canonicalDocket(record.provenance?.docket??'');
 const court=String(record.provenance?.court??'').toLowerCase().replace(/[^a-z0-9]/g,'');
 return index.sources.some(old=>{
  if(canonicalUrl(old.sourceUrl)===url)return true;
  if(name&&old.caseNames.some(n=>canonicalCaseName(n)===name))return true;
  return Boolean(docket&&court&&old.metadata.some(m=>String(m.court??'').toLowerCase().replace(/[^a-z0-9]/g,'')===court&&[...(old.dockets??[]),m.docket,m.docketNumber].filter(Boolean).some(d=>canonicalDocket(d)===docket)));
 });
}
