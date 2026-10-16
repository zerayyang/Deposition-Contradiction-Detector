import fs from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {witnessQuoteMatches} from '../sourceEvidence.js';
import {testimonyMarkers} from '../testimonyMarkers.js';

export const eventSchema=JSON.parse(fs.readFileSync(new URL('./schema.v1.json',import.meta.url),'utf8'));
const ajv=new Ajv({allErrors:true,jsonPointers:true,removeAdditional:false,useDefaults:false,coerceTypes:false});
const validateShape=ajv.compile(eventSchema);
const reserved=/^(?:score|confidence|probability|humanConfidence|evidenceScore|evidenceStrength|band)$/i;
export const documentDigest=text=>createHash('sha256').update(text).digest('hex');

// Never edit or discard proposed records. Return every structural/source error.
// Semantic interpretation, named-witness extensions and comparison belong to later stages.
export function validateEventBundle(bundle,{documentId,text,pages=null}={}) {
 const errors=[];
 const add=(path,code,message)=>errors.push({path,code,message});
 if(typeof documentId!=='string'||typeof text!=='string')return {valid:false,errors:[{path:'',code:'SOURCE_REQUIRED',message:'Supply the original document ID and text.'}],eventResults:[],coverage:null};
 if(!validateShape(bundle))return {valid:false,errors:validateShape.errors.map(e=>({path:e.dataPath,code:'SCHEMA',message:e.message})),eventResults:[],coverage:null};
 if(bundle.documentId!==documentId)add('/documentId','DOCUMENT_MISMATCH','Record belongs to another document.');
 if(bundle.documentSha256!==documentDigest(text))add('/documentSha256','DOCUMENT_CHANGED','Original text differs from the extraction input.');
 const markers=testimonyMarkers(text);
 const questionSpans=markers.flatMap((m,i)=>m.role==='Q'?[{start:m.contentStart,end:markers[i+1]?.index??text.length}]:[]);
 const eventIds=new Set(),eventResults=[],sourceIds=new Set(),pageMap=new Map((Array.isArray(pages)?pages:[]).map(p=>[p.pdfPage,p]));
 if(pages!==null&&(!Array.isArray(pages)||pageMap.size!==pages.length||pages.some(p=>!Number.isInteger(p.pdfPage)||p.pdfPage<1||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||p.end>text.length)))add('/pages','INVALID_PAGE_MAP','Page references need a valid caller-supplied extraction map.');
 const documentValid=errors.length===0;
 for(const [i,event] of bundle.events.entries()){
  const base=`/events/${i}`,before=errors.length;
  if(eventIds.has(event.id))add(base+'/id','DUPLICATE_ID','Event IDs must be unique within a document.');eventIds.add(event.id);
  const sources=new Map();
  for(const [j,source] of event.sources.entries()){
   const path=base+`/sources/${j}`;
   if(sourceIds.has(source.id))add(path+'/id','DUPLICATE_ID','Source IDs must be unique within a document.');sourceIds.add(source.id);sources.set(source.id,source);
   if(source.end<=source.start||source.end>text.length||text.slice(source.start,source.end)!==source.quote)add(path,'QUOTE_MISMATCH','Offsets must reproduce the exact original quotation.');
   const inRole=source.role==='WITNESS'
    ?witnessQuoteMatches(text,source.quote).some(m=>m.index===source.start&&source.end<=m.end)
    :questionSpans.some(s=>source.start>=s.start&&source.end<=s.end);
   if(!inRole)add(path+'/role','SOURCE_ROLE','Quotation is not inside a supported source span of the declared role. Unsupported speaker formats need review.');
   if(source.pageRefs.length&&pages===null)add(path+'/pageRefs','PAGE_MAP_REQUIRED','Do not invent page numbers without an extraction map.');
   if(pages!==null&&Array.isArray(pages)){
    const expected=pages.filter(p=>p.end>source.start&&p.start<source.end).map(p=>({pdfPage:p.pdfPage,pageLabel:p.pageLabel??null}));
    if(JSON.stringify(source.pageRefs)!==JSON.stringify(expected))add(path+'/pageRefs','PAGE_MISMATCH','Page references must match all overlapped pages in source order.');
   }
  }
  // A question context must actually govern an answer in the same proposed event.
  for(const question of event.sources.filter(source=>source.role==='QUESTION')){
   const governs=event.sources.filter(source=>source.role==='WITNESS').some(source=>witnessQuoteMatches(text,source.quote).some(match=>match.index===source.start&&match.question&&question.start>=match.question.start&&question.end<=match.question.end));
   if(!governs)add(base+'/sources','QUESTION_NOT_GOVERNING','Question context must govern a preserved witness source in this event.');
  }
  const resolve=(ids,path)=>ids.map(id=>{const source=sources.get(id);if(!source)add(path,'UNKNOWN_SOURCE','Every source ID must refer to this event\'s preserved sources.');return source;}).filter(Boolean);
  const assertionSources=resolve(event.assertion.sourceIds,base+'/assertion/sourceIds');
  if(!assertionSources.some(s=>s.role==='WITNESS'))add(base+'/assertion','WITNESS_SUPPORT_REQUIRED','A question by itself does not establish a witness assertion.');
  const names=new Set();
  for(const [j,attribute] of event.attributes.entries()){
   const path=base+`/attributes/${j}`;
   if(names.has(attribute.name))add(path+'/name','DUPLICATE_ATTRIBUTE','Preserve separate events or distinct attribute names instead of overwriting a value.');names.add(attribute.name);
   if(reserved.test(attribute.name.replace(/[_\s-]/g,'')))add(path+'/name','MODEL_SCORE_FORBIDDEN','Extraction records cannot provide confidence, scores or probabilities.');
   const support=resolve(attribute.sourceIds,path+'/sourceIds');
   if(attribute.state==='STATED'){
    const role=attribute.basis==='WITNESS_WORDS'?'WITNESS':attribute.basis==='QUESTION_CONTEXT'?'QUESTION':null;
    if(typeof attribute.value!=='string'||!support.some(s=>s.role===role&&s.quote.includes(attribute.value)))add(path,'FIELD_NOT_LITERAL','A stated value must be literal words inside a referenced source of its declared basis.');
   }else if(attribute.value!==null||attribute.basis!=='NONE')add(path,'UNKNOWN_NOT_NULL','Unstated or ambiguous values must remain null, with basis NONE.');
   if(attribute.state==='UNSTATED'&&attribute.sourceIds.length)add(path,'UNSTATED_HAS_SOURCE','An absent fact cannot acquire a claimed source.');
  }
  for(const [j,q] of event.qualifiers.entries()){
   const path=base+`/qualifiers/${j}`,support=resolve([q.sourceId],path+'/sourceId');
   if(!support.some(s=>s.role==='WITNESS'&&s.quote.includes(q.phrase)))add(path,'QUALIFIER_NOT_LITERAL','Qualifier must be an exact witness phrase.');
   for(const name of q.attributeNames)if(!names.has(name))add(path+'/attributeNames','UNKNOWN_ATTRIBUTE','Qualifier references an absent attribute.');
  }
  const uncertain=['UNCERTAIN','UNKNOWN'].includes(event.assertion.polarity)||event.attributes.some(a=>a.state==='AMBIGUOUS')||event.qualifiers.some(q=>q.scope==='UNRESOLVED')||event.relations.some(link=>link.targetEventId===null);
  if(uncertain&&(!event.reviewRequired||!event.unresolvedReasons.length))add(base,'REVIEW_REQUIRED','Unresolved interpretation must remain visible with a review reason.');
  eventResults.push({id:event.id,valid:documentValid&&errors.length===before});
 }
 for(const [i,event] of bundle.events.entries())for(const link of event.relations){
  if(link.targetEventId!==null&&(!eventIds.has(link.targetEventId)||link.targetEventId===event.id)){
   add(`/events/${i}/relations`,'INVALID_RELATION','Correction/qualification must reference another preserved event.');eventResults[i].valid=false;
  }
 }
 let cursor=0,processedCharacters=0,unprocessedCharacters=0;
 const segments=bundle.coverage.segments;
 for(const [i,segment] of segments.entries()){
  const path=`/coverage/segments/${i}`;
  if(segment.start!==cursor||segment.end<=segment.start||segment.end>text.length)add(path,'COVERAGE_GAP_OR_OVERLAP','Account for every character exactly once in ordered, nonempty ranges.');
  cursor=segment.end;
  if(segment.status==='PROCESSED')processedCharacters+=segment.end-segment.start;
  else{unprocessedCharacters+=segment.end-segment.start;if(!segment.reason)add(path,'FAILURE_REASON_REQUIRED','Unprocessed and failed ranges need an explicit reason.');if(segment.eventIds.length)add(path,'UNPROCESSED_HAS_EVENTS','Unprocessed ranges cannot claim extracted events.');}
  for(const id of segment.eventIds)if(!eventIds.has(id))add(path+'/eventIds','UNKNOWN_EVENT','Coverage references an absent event.');
 }
 if(cursor!==text.length)add('/coverage','INCOMPLETE_ACCOUNTING','Coverage must account for the entire supplied document.');
 for(const [i,event] of bundle.events.entries())for(const source of event.sources){
  const covered=segments.some(segment=>segment.status==='PROCESSED'&&segment.eventIds.includes(event.id)&&source.start>=segment.start&&source.end<=segment.end);
  if(!covered){add(`/events/${i}/sources`,'SOURCE_OUTSIDE_PROCESSED_RANGE','Each event source must be inside a processed range that names the event.');eventResults[i].valid=false;}
 }
 const expectedStatus=segments.every(s=>s.status==='PROCESSED')?'COMPLETE':segments.some(s=>s.status==='PROCESSED')?'PARTIAL':'FAILED';
 if(bundle.coverage.status!==expectedStatus)add('/coverage/status','COVERAGE_STATUS','Status must reflect processed versus unprocessed ranges.');
 const accountingValid=!errors.some(error=>error.path.startsWith('/coverage')||error.code==='SOURCE_OUTSIDE_PROCESSED_RANGE');
 return {valid:errors.length===0,errors,eventResults,coverage:{totalCharacters:text.length,processedCharacters:accountingValid?processedCharacters:null,unprocessedCharacters:accountingValid?unprocessedCharacters:null,status:accountingValid?expectedStatus:'INVALID',accountingValid},
  notice:'Validation checks record shape, literal sources and accounting only. It does not prove semantic labels, source truth, exhaustive event recall, matching events or numeric confidence.'};
}
