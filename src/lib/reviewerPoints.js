// Display excerpts only. Original reviewer text remains available in Details.
export function reviewerPoints(objections) {
  const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
  return (Array.isArray(objections)?objections:[]).filter(v=>typeof v==='string')
    .flatMap(text=>[...segmenter.segment(text)].map(s=>s.segment.trim())).filter(Boolean).slice(0,3)
    .map(text=>text.length<=140?text:text.slice(0,137).replace(/\s+\S*$/,'')+'…');
}
