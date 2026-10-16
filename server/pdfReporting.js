// Only confirmed, repeated PDF furniture can stop being a speaker boundary.
// The original text and all offsets remain intact; no testimony is discarded.
export function pdfReportingRanges(text,pages){
 if(!Array.isArray(pages)||pages.length<3)return [];
 const candidates=[],counts=new Map();
 for(const page of pages){
  const lines=[...text.slice(page.start,page.end).matchAll(/[^\n]+/g)].map(m=>({text:m[0],start:page.start+m.index}));
  const seen=new Set();
  for(const line of [...new Set([...lines.slice(0,7),...lines.slice(-6)])]){
   const signature=line.text.replace(/^\s*(?:[1-9]|1\d|2[0-5])\s+/,'').trim();
   if(!/^(?:FILED: .+|INDEX NO\. .+|NYSCEF DOC\. NO\. .+|CONFIDENTIAL(?: - .+)?|Proceedings)$/i.test(signature))continue;
   candidates.push({...line,signature});if(!seen.has(signature)){counts.set(signature,(counts.get(signature)??0)+1);seen.add(signature);}
  }
 }
 return candidates.filter(c=>counts.get(c.signature)>=3).map(c=>({start:c.start,end:c.start+c.text.length,kind:'REPEATED_PDF_HEADER'}));
}
