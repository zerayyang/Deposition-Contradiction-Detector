import {parseTestimonySource} from '../testimonySource.js';
import {assessCandidate} from '../humanConfidencePipeline.js';
import {literalActivityPhrase} from '../scoring/rules.js';
// This bridge adds no evidence rules. Existing rules receive only literal
// witness-backed attributes or a complete answer accepted by their activity grammar.
const fields=['activity','time','location','person','object','quantity','state'];
function claimFor(source,event,document,index){
 const claim={original:source.quote,qualifierPhrases:[]};
 for(const field of fields){
  const values=[...new Set((event?.attributes??[]).filter(a=>a.name===field&&a.state==='STATED'&&a.basis==='WITNESS_WORDS'&&a.sourceIds.includes(source.id)&&source.quote.includes(a.value)).map(a=>a.value))];
  claim[field+'Phrase']=values.length===1?values[0]:null;
 }
 // Attribute names are open-ended. A complete literal answer can supply the
 // existing activity grammar without guessing which custom attribute is an action.
 // Cropped answers must not hide a negation, correction or qualification.
 const turn=index.turns.find(t=>t.role==='WITNESS'&&source.start>=t.contentStart&&source.end<=t.end);
 if(!claim.activityPhrase&&turn&&document.text.slice(turn.contentStart,turn.end).trim()===source.quote.trim()
  &&!(event?.attributes??[]).some(a=>a.name==='activity'&&a.state==='AMBIGUOUS'))claim.activityPhrase=literalActivityPhrase(source.quote);
 claim.qualifierPhrases=(event?.qualifiers??[]).filter(q=>q.sourceId===source.id&&source.quote.includes(q.phrase)).map(q=>q.phrase);
 return claim;
}
export function scoreEventComparisons(comparisonResult,extractionPlan){
 const indexes=extractionPlan.documents.map(d=>parseTestimonySource(d.text,{speakerRoles:d.speakerRoles,pages:d.pages}));
 const multipleWitnesses=indexes.some(index=>new Set(index.turns.filter(t=>t.role==='WITNESS'&&t.speaker).map(t=>t.speaker.trim().toUpperCase())).size>1);
 return comparisonResult.comparisons.map(comparison=>{
  const variant=comparison.variants[0];
  const sources=[comparison.leftSources,comparison.rightSources].map(side=>side.filter(s=>s.role==='WITNESS'));
  const records=[variant.leftId,variant.rightId].map((id,i)=>comparisonResult.catalogs[i].find(g=>g.id===id)?.event);
  const selected=sources.map(side=>side[0]);
  if(selected.some(s=>!s))throw new Error('Comparison has no validated witness quotation.');
  const claims=selected.map((source,i)=>claimFor(source,records[i],extractionPlan.documents[i],indexes[i]));
  const options=Object.fromEntries(selected.map((source,i)=>['claim'+(i+1),{start:source.start,end:source.end,speakerRoles:extractionPlan.documents[i].speakerRoles,pages:extractionPlan.documents[i].pages}]));
  const scored=assessCandidate({type:comparison.type,reasoning:variant.reasoning,claim1:claims[0],claim2:claims[1]},...extractionPlan.documents.map(d=>d.text),options);
  // Multiple supporting passages are kept, never stitched into fabricated text.
  // Unresolved event/identity/context cannot activate a numeric score.
  const blocked=multipleWitnesses||comparison.reviewRequired||sources.some(side=>side.length!==1)||records.some(e=>!e||e.reviewRequired||e.relations.length>0);
  if(blocked)Object.assign(scored,{score:null,humanConfidence:null,evidenceScore:null,evidenceStrength:null,band:'NOT_EVALUABLE',status:'NOT_EVALUABLE',basis:'NOT_EVALUABLE',notEvaluableReason:'MISSING_CONTEXT',rulesFired:[],evidenceDetails:[],comparisons:{},flag:'REVIEW',reasons:['Event identity, context or multiple source passages require review.'],rulesLimiting:[{id:'event-context',explanation:'A source-valid quotation alone does not establish a shared event or resolve corrections.'}]});
  return {...scored,id:comparison.id,report:comparison.report,reviewRequired:comparison.reviewRequired,
   sourceReferences:Object.fromEntries(sources.map((side,i)=>['claim'+(i+1),side.flatMap(s=>s.pageRefs.length?s.pageRefs.map(p=>({...p,start:s.start,end:s.end})):[{start:s.start,end:s.end}])])),
   eventDetails:{issue:comparison.issue,records,comparison,notice:'AI proposes events and categories. Exact sources are checked by code; meaning and detection completeness still need review.'}};
 });
}
