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
// Reading sees one document range, so a reference to testimony outside it stays
// unresolved there. Comparison sees both sides; when it reports nothing missing and
// nothing else needs review, that reference no longer withholds the score.
// Corrections, ambiguity, disagreement and unconfirmed identity still block.
function resolvedOutsideLink(comparison,records,comparisonResult){
 if(!comparisonResult.context?.sameWitnessConfirmed||comparison.typeDisagreement||comparison.reportDisagreement)return false;
 if(records.some(e=>!e)||!records.some(e=>e.relations.length>0))return false;
 const outside=e=>e.relations.every(r=>r.targetEventId===null&&['QUALIFIES','REPORTS'].includes(r.kind))
  &&!(e.attributes??[]).some(a=>a.state==='AMBIGUOUS')&&(e.unresolvedReasons??[]).length<=e.relations.length
  &&(!e.reviewRequired||e.relations.length>0);
 if(!records.every(outside))return false;
 const tasks=comparisonResult.tasks??[],pairs=new Map(tasks.flatMap(t=>t.pairs??[]).map(p=>[p.pairId,p]));
 return comparison.variants.every(v=>{const pair=pairs.get(v.pairId);
  return pair?.relation==='RELATED'&&!pair.coverageConflict&&(v.missingContext??[]).length===0
   &&!tasks.some(t=>(t.rejected??[]).some(r=>r.pairId===v.pairId));});
}
// Cards whose quotes share a witness answer on both sides but carry different labels
// are one unsettled judgment, not two findings. Combine only those into a single
// review card that keeps every view; same-label cards may be distinct issues and stay.
export function mergeConflictingLabels(cards,extractionPlan){
 const indexes=extractionPlan.documents.map(d=>parseTestimonySource(d.text,{speakerRoles:d.speakerRoles,pages:d.pages}));
 const answers=(side,i)=>new Set(side.filter(s=>s.role==='WITNESS').map(s=>indexes[i].turns.findIndex(t=>t.role==='WITNESS'&&s.start>=t.contentStart&&s.end<=t.end)).filter(n=>n>=0));
 const keys=cards.map(c=>c.eventDetails?[answers(c.eventDetails.comparison.leftSources,0),answers(c.eventDetails.comparison.rightSources,1)]:null);
 const overlap=(a,b)=>[...a].some(x=>b.has(x));
 const parent=cards.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)
  if(keys[i]&&keys[j]&&cards[i].type!==cards[j].type&&overlap(keys[i][0],keys[j][0])&&overlap(keys[i][1],keys[j][1]))parent[root(j)]=root(i);
 const groups=new Map();cards.forEach((c,i)=>{const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(c);});
 return [...groups.values()].map(group=>{
  if(new Set(group.map(c=>c.type)).size<2)return group[0];
  const rank={DIRECT:0,INFERENTIAL:1,NEEDS_REVIEW:2,FALSE_POSITIVE:3},base=[...group].sort((a,b)=>rank[a.type]-rank[b.type])[0];
  const views=group.map(c=>({id:c.id,type:c.type,issue:c.eventDetails.issue,reasoning:c.reasoning,report:c.report}));
  return {...base,id:'merged:'+group.map(c=>c.id).join('|'),report:true,reviewRequired:true,labelDisagreement:true,
   typeAlternatives:[...new Set(group.map(c=>c.type))],mergedViews:views,
   score:null,humanConfidence:null,evidenceScore:null,evidenceStrength:null,band:'NOT_EVALUABLE',status:'NOT_EVALUABLE',basis:'NOT_EVALUABLE',
   notEvaluableReason:'LABEL_DISAGREEMENT',rulesFired:[],evidenceDetails:[],comparisons:{},flag:'REVIEW',
   reasons:[`Labels disagree — review. ${group.length} comparisons of the same answers reached ${[...new Set(group.map(c=>c.type))].join(' / ')}.`],
   rulesLimiting:[{id:'label-disagreement',explanation:'Comparisons of the same witness answers reached different categories; no score until a person decides.'}]};
 });
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
  // A possible conflict that needs a missing fact gets no score; the rules see it as unproven.
  const needsReview=comparison.type==='NEEDS_REVIEW';
  const scored=assessCandidate({type:needsReview?'INFERENTIAL':comparison.type,reasoning:variant.reasoning,claim1:claims[0],claim2:claims[1]},...extractionPlan.documents.map(d=>d.text),options);
  if(needsReview)Object.assign(scored,{type:'NEEDS_REVIEW',score:null,humanConfidence:null,evidenceScore:null,evidenceStrength:null,band:'NOT_EVALUABLE',status:'NOT_EVALUABLE',basis:'NOT_EVALUABLE',notEvaluableReason:'NEEDS_REVIEW',rulesFired:[],evidenceDetails:[],comparisons:{},flag:'REVIEW',
   reasons:['Possible contradiction — a fact needed to decide is missing: '+(variant.missingContext??[]).join('; ')]});
  // Multiple supporting passages are kept, never stitched into fabricated text.
  // Unresolved event/identity/context cannot activate a numeric score.
  const outsideLink=resolvedOutsideLink(comparison,records,comparisonResult);
  const blocked=multipleWitnesses||sources.some(side=>side.length!==1)||records.some(e=>!e)
   ||!outsideLink&&(comparison.reviewRequired||records.some(e=>e.reviewRequired||e.relations.length>0));
  if(!blocked&&outsideLink)Object.assign(scored,{flag:'REVIEW',reasons:[...(scored.reasons??[]),'Refers to other testimony; check the link.']});
  if(blocked&&!needsReview)Object.assign(scored,{score:null,humanConfidence:null,evidenceScore:null,evidenceStrength:null,band:'NOT_EVALUABLE',status:'NOT_EVALUABLE',basis:'NOT_EVALUABLE',notEvaluableReason:'MISSING_CONTEXT',rulesFired:[],evidenceDetails:[],comparisons:{},flag:'REVIEW',reasons:['Event identity, context or multiple source passages require review.'],rulesLimiting:[{id:'event-context',explanation:'A source-valid quotation alone does not establish a shared event or resolve corrections.'}]});
  return {...scored,id:comparison.id,report:comparison.report,reviewRequired:comparison.reviewRequired,
   sourceReferences:Object.fromEntries(sources.map((side,i)=>['claim'+(i+1),side.flatMap(s=>s.pageRefs.length?s.pageRefs.map(p=>({...p,start:s.start,end:s.end})):[{start:s.start,end:s.end}])])),
   eventDetails:{issue:comparison.issue,records,comparison,notice:'AI proposes events and categories. Exact sources are checked by code; meaning and detection completeness still need review.'}};
 });
}
