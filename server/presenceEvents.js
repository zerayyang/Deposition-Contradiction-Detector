import {testimonyMarkers} from './testimonyMarkers.js';

const normalized=value=>value.toLowerCase().replace(/’/g,"'").replace(/\s+/g,' ').replace(/[.!?]+$/,'').trim();
const placeKey=value=>normalized(value).replace(/^the /,'');
const uncertain=/\b(?:don't remember|do not remember|can't remember|cannot remember|don't recall|do not recall|not sure|don't know|do not know|might|maybe|perhaps|possibly|if|unless|suppose|would)\b/i;
function presenceAnswer(answer,place) {
 const text=normalized(answer),first=text.split(/(?<=[.!?])\s+/)[0];
 if(uncertain.test(first))return {presence:'UNKNOWN',reason:'The presence answer is uncertain or conditional.'};
 const no=/^no(?:$|[,.!])/i.test(first),yes=/^yes(?:$|[,.!])/i.test(first);
 const target='(?:there|at (?:the )?'+placeKey(place).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')';
 const affirmed=new RegExp("\\bi was "+target+"(?:\\b|$)",'i').test(text);
 const denied=new RegExp("\\bi (?:wasn't|was not) "+target+"(?:\\b|$)",'i').test(text);
 if((no&&affirmed)||(yes&&denied)||(affirmed&&denied)||/\b(?:i misspoke|i need to correct|correction)\b/i.test(text))return {presence:'UNKNOWN',reason:'The answer contains conflicting polarity or a correction; review the full answer.'};
 if(no||denied)return {presence:'DENIED',reason:'The answer explicitly denies the governing presence question.'};
 if(yes||affirmed)return {presence:'AFFIRMED',reason:'The answer explicitly affirms the governing presence question.'};
 return {presence:'UNKNOWN',reason:'No supported explicit presence affirmation or denial was found.'};
}
// This is a bounded source index, not a complete event extractor or a score rule.
// Only an immediately adjacent positive first-person presence Q/A is supported.
export function presenceEvents(text) {
 const markers=testimonyMarkers(text),events=[];
 for(let i=0;i<markers.length-1;i++){
  const q=markers[i],a=markers[i+1];if(q.role!=='Q'||a.role!=='A')continue;
  const qEnd=a.index,aEnd=markers[i+2]?.index??text.length;
  const question=text.slice(q.contentStart,qEnd).trim(),answer=text.slice(a.contentStart,aEnd).trim();
  const match=question.match(/^Were you (?:present )?at (.+?) (?:on|during) (.+?)\?$/i);
  if(!match)continue;
  const place=match[1],occasion=match[2];
  const compound=/\b(?:and|or)\b/i.test(place+' '+occasion)||/\b(?:if|unless|not|never)\b/i.test(question);
  const assertion=compound?{presence:'UNKNOWN',reason:'Compound or qualified question; no single event is resolved.'}:presenceAnswer(answer,place);
  events.push({kind:'PRESENCE',subject:'FIRST_PERSON_WITNESS',place,occasion,...assertion,otherPeople:'UNKNOWN',
   source:{questionStart:q.contentStart,questionEnd:qEnd,answerStart:a.contentStart,answerEnd:aEnd},
   notice:'Place and occasion come from the governing question; quotation wording is unchanged. Matching occasions do not establish witness identity.'});
 }
 return events;
}
export function presenceIndex(first,second) {
 const left=presenceEvents(first),right=presenceEvents(second);
 if(!left.length&&!right.length)return null;
 return {scope:'NON_EXHAUSTIVE_FIRST_PERSON_PRESENCE_QA',transcript1:left,transcript2:right,
  notice:'Source index only. Verify against the original Q/A. Unknown is not no. Same witness identity must be established; different places or occasions may describe different events. Read all testimony, including events absent from this index. This index supplies no classifications, evidence scores or numeric confidence.'};
}
