import Ajv from 'ajv';
import {eventSchema,validateEventBundle,documentDigest} from './validate.js';

// Transport has no authority to invent offsets, page refs, roles or coverage.
const definitions=structuredClone(eventSchema.definitions);
definitions.source={type:'object',additionalProperties:false,required:['id','unitId','quote','occurrence'],properties:{
  id:{type:'string',minLength:1},unitId:{type:'string',minLength:1},quote:{type:'string',minLength:1},
  occurrence:{type:['integer','null'],minimum:0}}};
export const extractionWireSchema={type:'object',additionalProperties:false,required:['schemaVersion','events','units'],properties:{
  schemaVersion:{const:1},events:{type:'array',items:{$ref:'#/definitions/event'}},
  units:{type:'array',items:{type:'object',additionalProperties:false,required:['unitId','status','eventIds','reason'],properties:{
    unitId:{type:'string',minLength:1},status:{enum:['EVENTS','NO_EVENT','UNRESOLVED']},
    eventIds:{type:'array',uniqueItems:true,items:{type:'string',minLength:1}},reason:{type:['string','null'],minLength:1}}}}},definitions};
const ajv=new Ajv({allErrors:true,jsonPointers:true,removeAdditional:false,useDefaults:false,coerceTypes:false});
const envelope=ajv.compile({type:'object',additionalProperties:false,required:['schemaVersion','events','units'],properties:{schemaVersion:{const:1},events:{type:'array'},units:{type:'array'}}});
const eventShape=ajv.compile({$ref:'#/definitions/event',definitions});
const unitShape=ajv.compile(extractionWireSchema.properties.units.items);
const shapeErrors=validator=>validator.errors.map(e=>({code:'SCHEMA',path:e.dataPath,message:e.message}));

// Reuse Part 1 source checks without presenting synthetic validation coverage as
// actual processing progress. Only the extraction executor reports real coverage.
export function validateEventRecords(events,source) {
  const checked=validateEventBundle({schemaVersion:1,documentId:source.documentId,documentSha256:documentDigest(source.text),events,
    coverage:{status:'COMPLETE',segments:[{start:0,end:source.text.length,status:'PROCESSED',eventIds:events.map(e=>e.id),reason:null}]}},source);
  return {valid:checked.valid,errors:checked.errors,eventResults:checked.eventResults,sourceDiagnostics:checked.sourceDiagnostics,
    notice:'Record shape and literal source checks only; this result makes no extraction-coverage or semantic-accuracy claim.'};
}
export function parseExtractionMessage(message) {
  const rawText=Array.isArray(message?.content)?message.content.filter(b=>b.type==='text').map(b=>b.text).join(''):'';
  if(message?.stop_reason!=='end_turn')throw new Error(`Incomplete extraction response (${message?.stop_reason??'unknown stop reason'}).`);
  const response=JSON.parse(rawText); // No fence stripping, repair, coercion or text rewriting.
  if(!envelope(response))throw new Error('Invalid extraction envelope: '+JSON.stringify(shapeErrors(envelope)));
  return response;
}
function occurrences(text,quote) {
  const found=[];
  for(let at=text.indexOf(quote);at>=0;at=text.indexOf(quote,at+1))found.push(at);
  return found;
}
export function materializeExtraction(response,task,document) {
  const issues=[],rejected=[],proposed=[],anchorAudit=[];
  const add=(code,message,extra={})=>issues.push({code,message,...extra});
  const counts=new Map();for(const e of response.events)counts.set(e?.id,(counts.get(e?.id)??0)+1);
  const namespace=`d${task.documentIndex}:t${task.index}:`,eventId=id=>namespace+'e:'+encodeURIComponent(id);
  for(const [index,raw] of response.events.entries()) {
    try {
      if(!eventShape(raw))throw new Error('Invalid event schema: '+JSON.stringify(shapeErrors(eventShape)));
      if(raw.attributes.some(a=>/confidence|probability|^score|evidence(?:score|strength)/i.test(a.name.replace(/[_\s-]/g,''))))throw new Error('Model scoring attributes are forbidden.');
      if(counts.get(raw.id)!==1)throw new Error('Duplicate proposed event ID; all occurrences require review.');
      const event=structuredClone(raw),sourceIds=new Map(event.sources.map(s=>[s.id,`${eventId(event.id)}:s:${encodeURIComponent(s.id)}`]));
      if(sourceIds.size!==event.sources.length)throw new Error('Duplicate source ID in proposed event.');
      const audits=[];
      event.sources=raw.sources.map(s=>{
        const unit=task.input.sources.find(u=>u.id===s.unitId);
        if(!unit)throw new Error('Source references an unavailable unit.');
        const matches=occurrences(unit.text,s.quote);
        if(!matches.length)throw new Error('Quotation does not match its submitted source verbatim.');
        if(s.occurrence===null&&matches.length!==1)throw new Error('Repeated quotation needs an explicit occurrence; first-match guessing is forbidden.');
        const at=matches[s.occurrence??0];if(at===undefined)throw new Error('Quoted occurrence does not exist.');
        const start=unit.start+at,end=start+s.quote.length;
        audits.push({proposedSourceId:s.id,unitId:unit.id,start,end,speaker:unit.speaker,roleOrigin:unit.roleOrigin});
        return {id:sourceIds.get(s.id),role:unit.role,quote:s.quote,start,end,
          pageRefs:document.pages?.filter(p=>p.end>start&&p.start<end).map(p=>({pdfPage:p.pdfPage,pageLabel:p.pageLabel??null}))??[]};
      });
      if(!event.sources.some(s=>s.role==='WITNESS'&&s.end>task.coreStart&&s.start<task.coreEnd))throw new Error('Context-only event has no witness quotation in the assigned core range.');
      const ref=id=>sourceIds.get(id)??`UNKNOWN_SOURCE:${id}`;
      event.id=eventId(raw.id);event.assertion.sourceIds=event.assertion.sourceIds.map(ref);
      event.attributes.forEach(a=>{a.sourceIds=a.sourceIds.map(ref);});
      event.qualifiers.forEach(q=>{q.sourceId=ref(q.sourceId);});
      event.relations.forEach(r=>{if(r.targetEventId!==null)r.targetEventId=eventId(r.targetEventId);});
      proposed.push({index,event,rawId:raw.id,audits});
    }catch(error){rejected.push({index,proposed:raw,errors:[{code:'EVENT_REJECTED',message:error.message}]});add('EVENT_REJECTED',error.message,{eventIndex:index});}
  }
  // Quarantine invalid records and their dependent links; preserve every raw record
  // and each rejection rather than changing fields or dropping audit evidence.
  let accepted=proposed;
  while(accepted.length) {
    const checked=validateEventRecords(accepted.map(p=>p.event),document);
    if(checked.valid)break;
    const bad=new Set(checked.errors.flatMap(e=>{const m=/^\/events\/(\d+)(?:\/|$)/.exec(e.path);return m?[Number(m[1])]:[];}));
    if(!bad.size)accepted.forEach((_,i)=>bad.add(i));
    accepted=accepted.filter((p,i)=>{
      if(!bad.has(i))return true;
      const errors=checked.errors.filter(e=>!/^\/events\//.test(e.path)||e.path===`/events/${i}`||e.path.startsWith(`/events/${i}/`));
      rejected.push({index:p.index,proposed:response.events[p.index],materialized:p.event,errors});
      add('SOURCE_VALIDATION','Proposed event failed deterministic record/source validation.',{eventIndex:p.index,errors});return false;
    });
  }
  for(const p of accepted)anchorAudit.push({eventId:p.event.id,sources:p.audits});
  const owned=task.input.sources.filter(u=>u.role==='WITNESS'&&u.assigned),seen=new Set(),referenced=new Set();
  for(const [index,review] of response.units.entries()) {
    if(!unitShape(review)){add('UNIT_REVIEW_SCHEMA','Invalid answer disposition.',{index,errors:shapeErrors(unitShape)});continue;}
    const unit=owned.find(u=>u.id===review.unitId);
    if(!unit){add('UNASSIGNED_UNIT','Disposition refers to a unit outside this task.',{index});continue;}
    if(seen.has(unit.id))add('DUPLICATE_UNIT_REVIEW','Answer disposition was repeated.',{unitId:unit.id});seen.add(unit.id);
    if(review.status==='EVENTS') {
      if(!review.eventIds.length)add('EMPTY_EVENT_REVIEW','EVENTS needs at least one event ID.',{unitId:unit.id});
      for(const id of review.eventIds) {
        const item=accepted.find(e=>e.rawId===id);
        const witness=item?.audits.find(s=>s.unitId===unit.id&&s.end>task.coreStart&&s.start<task.coreEnd);
        if(!witness)add('UNSUPPORTED_UNIT_EVENT','Answer disposition lacks a validated event sourced in its assigned range.',{unitId:unit.id,eventId:id});
        else referenced.add(item.event.id);
      }
    }else{
      if(review.eventIds.length||!review.reason)add('INVALID_EMPTY_REVIEW','NO_EVENT/UNRESOLVED needs a reason and no event IDs.',{unitId:unit.id});
      if(review.status==='UNRESOLVED')add('UNIT_UNRESOLVED',review.reason??'Answer remains unresolved.',{unitId:unit.id});
    }
  }
  for(const unit of owned)if(!seen.has(unit.id))add('MISSING_UNIT_REVIEW','Assigned answer was not accounted for.',{unitId:unit.id});
  for(const item of accepted)if(!referenced.has(item.event.id))add('UNACCOUNTED_EVENT','A validated event is missing from the assigned-answer dispositions.',{eventId:item.event.id});
  return {events:accepted.map(p=>p.event),rejected,issues,anchorAudit,unitReviews:structuredClone(response.units)};
}
