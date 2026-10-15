import {normalize,parseTimeRange,overlaps,alignClockRanges} from './parsers.js';
const clock='(?:midnight|noon|(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?(?:\\s*(?:am|pm))?)';
const modifiers='(?:(?:around|about|roughly|approximately|maybe|perhaps|probably|at)\\s+)*';
const compound=new RegExp(`^${modifiers}${clock}\\s*,\\s*(?:maybe|perhaps)\\s+${clock}(?:\\s+or so)?[.!?]?$`);
const windowPattern=new RegExp(`^(?:somewhere\\s+)?(?:between ${clock} and ${clock}|from ${clock} to ${clock})[.!?]?$`);
const point=new RegExp(`^${modifiers}${clock}(?:\\s+(?:or so|at night|in the (?:morning|afternoon|evening)))?[.!?]?$`);
const clean=text=>normalize(text).replace(/\b([ap])(?:\s*\.\s*|\s+)m\.?(?!\w)/g,'$1m');
export function parseEventExpression(phrase,context,config){
 const text=clean(phrase),kind=compound.test(text)?'estimate':windowPattern.test(text)?'window':point.test(text)?'point':null;
 if(!kind)return null;
 const parsed=parseTimeRange(text,context,config);
 if(!parsed)return null;
 let alternatives;
 if(!parsed.missing)alternatives=[parsed];
 else alternatives=['am','pm'].map(period=>parseTimeRange(text,{...context,period},config));
 if(alternatives.some(r=>!r||r.missing))return null;
 return {kind,alternatives};
}
const source=f=>clean(f.sourceStatement||f.original).replace(/[.!?]+$/,'').trim();
const assertionBlocked=f=>/\b(?:not|never|didn't|did not|wasn't|said|say|scheduled|planned|except|unless|if|whether|remember|recall)\b/.test(source(f));
function departureBound(f,config){
 const m=source(f).match(/^i (?:didn't|did not) (?:leave|depart) before (midnight|noon|\d{1,2}(?::\d{2})?\s*(?:am|pm))$/);
 if(!m||!f.time||!clean(f.time).includes(m[1]))return null;
 const bound=parseTimeRange(m[1],{},config);
 return bound&&!bound.missing?bound.earliest:null;
}
function departurePoint(f,config){
 const m=source(f).match(/^i (?:left|departed)(?: (?:the party|the event|home|the office))? (.+)$/);
 if(!m||!f.time||assertionBlocked(f))return null;
 // Parse the full source tail: a cropped model time cannot hide a qualifier/bound.
 return parseEventExpression(m[1],{text:f.context},config);
}
export function compareStructuredTimes(f1,f2,context,config){
 if(!context.sameEvent||context.mismatch||context.personMismatch)return null;
 // A negated BEFORE is a lower bound, never a blanket denial of departure.
 for(const [boundFact,eventFact,reversed] of [[f1,f2,false],[f2,f1,true]]){
  const lower=departureBound(boundFact,config),event=departurePoint(eventFact,config);
  if(lower===null||!event||event.kind!=='point')continue;
  const comparisons=event.alternatives.map(range=>{
   // Keep both period alternatives. Only clocks close to midnight can use the
   // adjacent midnight boundary; noon is not silently converted to 00:00.
   const aligned=lower===config.minutesPerDay&&range.latest<config.midnightAlignmentWindow?
    {...range,earliest:range.earliest+config.minutesPerDay,latest:range.latest+config.minutesPerDay}:range;
   return {range:aligned,compatible:aligned.latest>=lower};
  });
  if(!comparisons.some(c=>c.compatible))return {applicable:false,explanation:'No supported departure interpretation satisfies the lower bound; date rollover remains unresolved.'};
  return {applicable:true,verdict:'COMPATIBLE',strength:0,basis:'DERIVED',fieldsUsed:['time','activity'],
   explanation:'The source denies departure before a boundary, not departure itself. A supported departure window satisfies that lower bound.',
   target1:f1.time,target2:f2.time,lowerBoundMinutes:lower,alternativeComparisons:comparisons,
   boundSide:reversed?2:1,limits:['Compatibility means the statements can coexist under a supported clock interpretation; it does not establish the actual AM/PM or calendar rollover. No LLM relationship or type was used.']};
 }
 if(assertionBlocked(f1)||assertionBlocked(f2))return null;
 if([f1,f2].some(f=>/\b(?:continuously|throughout|asleep|slept|sleeping|awake|watching|stayed|remained|all (?:day|night|evening))\b/.test(source(f))))return null;
 if(f1.activity&&f2.activity&&normalize(f1.activity)!==normalize(f2.activity))return null;
 const a=parseEventExpression(f1.time,{text:f1.context,period:context.period},config),b=parseEventExpression(f2.time,{text:f2.context,period:context.period},config);
 // Ordinary single-clock comparisons retain their existing conservative contract.
 if(!a||!b||a.kind==='point'&&b.kind==='point')return null;
 const comparisons=a.alternatives.flatMap(x=>b.alternatives.map(y=>{
  const [left,right]=alignClockRanges(x,y,config);
  return {ranges:[left,right],verdict:overlaps(left,right)?'COMPATIBLE':'CONFLICT'};
 }));
 // Windows/compound estimates constrain one event, not continuous activities.
 // Compatibility is satisfiability: an intersection shows that both can be true.
 if(!comparisons.some(c=>c.verdict==='COMPATIBLE'))return null;
 return {applicable:true,verdict:'COMPATIBLE',strength:0,basis:'DERIVED',fieldsUsed:['time'],
  explanation:'The same-event time estimates/windows have a nonempty intersection under at least one supported interpretation.',
  target1:f1.time,target2:f2.time,alternativeComparisons:comparisons,
  limits:['This establishes possible consistency, not a uniquely known time. AM/PM alternatives are retained rather than selected.',`Approximate clock estimates use the configured ${config.timeToleranceMinutes}-minute tolerance; stated windows are not continuous-activity claims.`]};
}
