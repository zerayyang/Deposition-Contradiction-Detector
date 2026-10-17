// Fixed before corpus assembly. Bracket characters and omission markers are
// formatting; bracketed words remain evidence and are NOT silently discarded.
export function evidenceTokens(text){
 return String(text).normalize('NFKC').replace(/[\[\]]/g,'').replace(/(?:\.{3,}|…)/g,' ').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[];
}
export function shingleCoverage(quote,source,width=5){
 const q=evidenceTokens(quote),s=evidenceTokens(source);
 if(!q.length)return 0;
 const shingles=(tokens,n)=>Array.from({length:Math.max(0,tokens.length-n+1)},(_,i)=>tokens.slice(i,i+n).join('\u0001'));
 if(q.length<width)return s.some((_,i)=>q.every((token,j)=>s[i+j]===token))?1:0;
 const wanted=shingles(q,width),actual=new Set(shingles(s,width));
 return wanted.filter(v=>actual.has(v)).length/wanted.length;
}
