// Shared policy keeps server finality and browser resume decisions in sync.
export function readingCanContinue(analysis){
 return analysis?.workflow==='events-v1'&&analysis.phase==='extract'&&analysis.readingPolicyVersion===2
  &&analysis.budgetExhausted!==true&&analysis.readingFinished===false&&analysis.status!=='cancelled'
  &&(analysis.tasks??[]).some(t=>['pending','not_attempted','running'].includes(t.status));
}

export const readingGapLabel='Reading incomplete—review required';
export const retainedNotesLabel='Compare retained notes only';
export const readingGapWarning='Unread or unvalidated ranges may contain contradictions. These results cover retained validated notes only.';
export function readingHasGaps(analysis){
 return analysis?.workflow==='events-v1'&&Boolean(analysis.eventState?.extraction?.gaps?.length||analysis.gaps?.length);
}
export function readingDocumentStats(analysis){
 const extraction=analysis?.eventState?.extraction;
 return (extraction?.documents??[]).map((doc,index)=>{
  const tasks=(extraction.tasks??[]).filter(t=>t.documentIndex===index&&t.mode==='MODEL');
  return {document:index+1,planned:tasks.length,validated:tasks.filter(t=>t.status==='COMPLETE').length,
   partial:tasks.filter(t=>t.status==='PARTIAL').length,failed:tasks.filter(t=>t.status==='FAILED').length,
   notes:doc.events?.length??0,coverage:doc.coverage?.status??'UNAVAILABLE'};
 });
}
export function readingDocumentLabel(doc){
 return `Transcript ${doc.document}: ${doc.validated}/${doc.planned} chunks validated · ${doc.partial} partial · ${doc.failed} failed · ${doc.notes} retained notes`;
}
