import Ajv from 'ajv';
import {decodeEventJson} from './jsonTransport.js';
import {decisionSchema,applyDecision} from '../typeDecision.js';

const text={type:'string',minLength:1},ids={type:'array',items:text,uniqueItems:true};
// The model answers `decision` first; code sets the type from it (server/typeDecision.js).
// Saved results from before the decision field still validate and keep their own type.
const issue={type:'object',additionalProperties:false,required:['issue','type','report','reasoning','leftSourceIds','rightSourceIds','missingContext'],properties:{
  issue:text,decision:decisionSchema,type:{enum:['DIRECT','INFERENTIAL','NEEDS_REVIEW','FALSE_POSITIVE']},report:{type:'boolean'},reasoning:text,leftSourceIds:ids,rightSourceIds:ids,missingContext:{type:'array',items:text}}};
const wireIssue={...issue,required:['issue','decision',...issue.required.filter(k=>k!=='issue')]};
export const comparisonWireSchema={type:'object',additionalProperties:false,required:['schemaVersion','rows'],properties:{schemaVersion:{const:1},rows:{type:'array',items:{type:'object',additionalProperties:false,required:['leftId','pairs','unrelatedRanges'],properties:{
  leftId:text,pairs:{type:'array',items:{type:'object',additionalProperties:false,required:['rightId','relation','reason','comparisons'],properties:{rightId:text,relation:{enum:['RELATED','UNRESOLVED']},reason:text,comparisons:{type:'array',items:wireIssue}}}},
  unrelatedRanges:{type:'array',items:{type:'object',additionalProperties:false,required:['start','end','reason'],properties:{start:{type:'integer',minimum:0},end:{type:'integer',minimum:0},reason:text}}}
}}}}};
const ajv=new Ajv({allErrors:true,jsonPointers:true,removeAdditional:false,useDefaults:false,coerceTypes:false});
const envelope=ajv.compile({type:'object',additionalProperties:false,required:['schemaVersion','rows'],properties:{schemaVersion:{const:1},rows:{type:'array'}}});
const rowShape=ajv.compile({type:'object',additionalProperties:false,required:['leftId','pairs','unrelatedRanges'],properties:{leftId:text,pairs:{type:'array'},unrelatedRanges:{type:'array'}}});
const pairShape=ajv.compile({type:'object',additionalProperties:false,required:['rightId','relation','reason','comparisons'],properties:{rightId:text,relation:{enum:['RELATED','UNRESOLVED']},reason:text,comparisons:{type:'array'}}});
const issueShape=ajv.compile(issue),rangeShape=ajv.compile(comparisonWireSchema.properties.rows.items.properties.unrelatedRanges.items);
export function parseComparisonMessage(message){
  if(message?.stop_reason!=='end_turn')throw new Error(`Incomplete event comparison (${message?.stop_reason??'unknown'}).`);
  const raw=Array.isArray(message.content)?message.content.filter(b=>b.type==='text').map(b=>b.text).join(''):'';
  const parsed=decodeEventJson(raw).value;
  if(!envelope(parsed))throw new Error('Invalid comparison envelope: '+JSON.stringify(envelope.errors));
  return parsed;
}
function sideSources(side,ids,primary){
  const all=[...side.records,...side.supportingRecords];
  const found=ids.map(id=>{
    const entries=all.flatMap(record=>record.event.sources.filter(s=>s.id===id));
    if(entries.length!==1)throw new Error('Source ID is missing or ambiguous within its assigned document block.');
    return entries[0];
  });
  if(!found.some(s=>s.role==='WITNESS'&&primary.event.sources.some(p=>p.id===s.id)))throw new Error('Comparison needs a literal witness source from each primary event.');
  return structuredClone(found);
}
// Every text the model was shown for this block (answers, questions, context), so a
// claimed reconciliation can be checked against the record.
function sourceStrings(value,out=[]){
  if(typeof value==='string')out.push(value);
  else if(Array.isArray(value))for(const v of value)sourceStrings(v,out);
  else if(value&&typeof value==='object')for(const v of Object.values(value))sourceStrings(v,out);
  return out;
}
export function validateComparisonResponse(response,task){
  const issues=[],pairs=[],comparisons=[],unrelated=[],rejected=[],seen=new Set(),rowCounts=new Map();let accountedPairs=0;
  const add=(code,message,extra={})=>issues.push({code,message,...extra});
  for(const row of response.rows)rowCounts.set(row?.leftId,(rowCounts.get(row?.leftId)??0)+1);
  for(const [rowIndex,row] of response.rows.entries()){
    if(!rowShape(row)){add('ROW_SCHEMA','Comparison row failed strict transport validation.',{rowIndex,errors:structuredClone(rowShape.errors)});rejected.push({rowIndex,row:structuredClone(row)});continue;}
    const left=task.input.left.records.find(e=>e.id===row.leftId);
    if(!left){add('UNASSIGNED_LEFT','Row refers to an event outside its assigned block.',{rowIndex});rejected.push({rowIndex,row:structuredClone(row)});continue;}
    seen.add(left.id);
    if(rowCounts.get(left.id)!==1){add('DUPLICATE_LEFT','All duplicate rows require review; none count as covered.',{leftId:left.id});rejected.push({rowIndex,row:structuredClone(row)});continue;}
    const count=task.input.right.records.length,cells=new Uint32Array(count),localPairs=[];
    for(const [pairIndex,pair] of row.pairs.entries()){
      if(!pairShape(pair)){add('PAIR_SCHEMA','Pair failed strict transport validation.',{rowIndex,pairIndex,errors:structuredClone(pairShape.errors)});rejected.push({rowIndex,pairIndex,pair:structuredClone(pair)});continue;}
      const rightIndex=task.input.right.records.findIndex(e=>e.id===pair.rightId);
      if(rightIndex<0){add('UNASSIGNED_RIGHT','Pair refers to an event outside its assigned block.',{rowIndex,pairIndex});rejected.push({rowIndex,pairIndex,pair:structuredClone(pair)});continue;}
      cells[rightIndex]++;
      const right=task.input.right.records[rightIndex],pairId=JSON.stringify([left.id,right.id]);
      const record={pairId,leftId:left.id,rightId:right.id,relation:pair.relation,reason:pair.reason,comparisonIds:[],reviewReasons:[...(!task.input.sameWitnessConfirmed?['Witness identity across documents is unconfirmed.']:[]),...left.event.unresolvedReasons,...right.event.unresolvedReasons],reviewRequired:pair.relation==='UNRESOLVED'||!task.input.sameWitnessConfirmed||left.event.reviewRequired||right.event.reviewRequired};
      if(pair.relation==='RELATED'&&!pair.comparisons.length)add('MISSING_COMPARISON','A related pair has no assessed issue.',{pairId});
      for(const [comparisonIndex,c] of pair.comparisons.entries()){
        if(!issueShape(c)){add('COMPARISON_SCHEMA','Comparison failed strict transport validation.',{pairId,comparisonIndex,errors:structuredClone(issueShape.errors)});rejected.push({pairId,comparisonIndex,comparison:structuredClone(c)});continue;}
        try{
          const leftSources=sideSources(task.input.left,c.leftSourceIds,left),rightSources=sideSources(task.input.right,c.rightSourceIds,right);
          const id=JSON.stringify([task.id,left.id,right.id,comparisonIndex]);
          const decided=applyDecision(structuredClone(c),sourceStrings(task.input));
          comparisons.push({...decided,id,pairId,leftId:left.id,rightId:right.id,leftSources,rightSources,
            reviewReasons:[...record.reviewReasons,...c.missingContext,...(pair.relation==='UNRESOLVED'?[pair.reason]:[])],reviewRequired:record.reviewRequired||c.missingContext.length>0||decided.type==='NEEDS_REVIEW',sourceVerified:true,taskId:task.id});
          record.comparisonIds.push(id);
        }catch(error){add('COMPARISON_SOURCE',error.message,{pairId,comparisonIndex});rejected.push({pairId,comparisonIndex,comparison:structuredClone(c),error:error.message});}
      }
      if(record.comparisonIds.length!==pair.comparisons.length||pair.relation==='RELATED'&&!record.comparisonIds.length)record.reviewRequired=true;
      localPairs.push(record);
    }
    for(const [rangeIndex,range] of row.unrelatedRanges.entries()){
      if(!rangeShape(range)){add('RANGE_SCHEMA','Unrelated interval failed strict validation.',{rowIndex,rangeIndex,errors:structuredClone(rangeShape.errors)});rejected.push({rowIndex,rangeIndex,range:structuredClone(range)});continue;}
      if(range.end<=range.start||range.end>count){add('INVALID_UNRELATED_RANGE','Unrelated interval is outside the assigned right block or empty.',{rowIndex,rangeIndex});rejected.push({rowIndex,rangeIndex,range:structuredClone(range)});continue;}
      for(let n=range.start;n<range.end;n++)cells[n]++;
      unrelated.push({taskId:task.id,leftId:left.id,rightStart:range.start,rightEnd:range.end,rightIds:task.input.right.records.slice(range.start,range.end).map(r=>r.id),reason:range.reason,
        notice:'Model-declared unrelated, not a deterministic proof.'});
    }
    for(let i=0;i<count;i++){
      if(cells[i]===1)accountedPairs++;
      else add(cells[i]===0?'MISSING_PAIR':'DUPLICATE_PAIR',cells[i]===0?'Assigned event pair has no disposition.':'Assigned event pair has contradictory or repeated dispositions.',{leftId:left.id,rightId:task.input.right.records[i].id});
    }
    for(const p of localPairs){
      const at=task.input.right.records.findIndex(e=>e.id===p.rightId);
      if(cells[at]!==1){p.reviewRequired=true;p.coverageConflict=true;for(const c of comparisons.filter(c=>c.pairId===p.pairId))c.reviewRequired=true;}
      pairs.push(p);
    }
  }
  for(const left of task.input.left.records)if(!seen.has(left.id))add('MISSING_LEFT','Assigned left event has no valid row.',{leftId:left.id});
  return {issues,rejected,pairs,comparisons,unrelated,accountedPairs,plannedPairs:task.input.left.records.length*task.input.right.records.length};
}
