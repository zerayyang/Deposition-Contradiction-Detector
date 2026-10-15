import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTemporal,dateScope} from './temporal.js';
import {parseTimeRange} from './parsers.js';
import {assessCandidate} from '../humanConfidencePipeline.js';
const claim=(original,timePhrase)=>({original,timePhrase,activityPhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
const run=(date1,date2,type='DIRECT')=>assessCandidate({type,claim1:claim('I arrived at 11 pm.','11 pm'),claim2:claim('I arrived at 7 pm.','7 pm')},`Q: When did you arrive on ${date1}?\nA: I arrived at 11 pm.`,`Q: When did you arrive on ${date2}?\nA: I arrived at 7 pm.`);
test('explicit components use requested format and retain provenance',()=>{
 const r=collectTemporal({original:'December 31, 2026 at 11:45 pm',time:'11:45 pm'});
 assert.equal(r.display,'2026/12/31 23/45');
 assert.equal(r.dates[0].original,'December 31, 2026');
 assert.equal(r.clocks[0].original,'11:45 pm');
});
test('unknown year, minute, date and AM/PM stay blank',()=>{
 assert.equal(collectTemporal({original:'December 31 at 11 pm',time:'11 pm'}).display,'/12/31 23/');
 const r=collectTemporal({original:'5:15',time:'5:15'});
 assert.deepEqual(r.fields,{year:'',month:'',day:'',hour:'',minute:'15'});
 assert.equal(r.clocks[0].hour12,'05');
 assert.equal(collectTemporal({original:'Tomorrow at 23:15',time:'23:15'}).display,'// 23/15');
 assert.equal(collectTemporal({original:"New Year's Eve"}).display,'/12/31 /');
 assert.equal(collectTemporal({original:'midnight',time:'midnight'}).display,'// 00/00');
});
test('calendar formats share keys without guessing ambiguous numeric dates',()=>{
 for(const s of ['2026/12/31','2026-12-31','December 31st, 2026',"New Year's Eve 2026"])assert.equal(dateScope(s).key,'2026/12/31');
 assert.equal(dateScope('12/11/2026').key,null);
 for(const s of ['February 30, 2026','2025/02/29','2026/13/01','January 1 and January 2'])assert.equal(dateScope(s).key,null,s);
 assert.equal(dateScope('February 29').key,'/02/29');
});
test('multiple clocks stay separate; no point is invented from a range',()=>{
 const r=collectTemporal({original:'from 11 pm to 1 am',time:'from 11 pm to 1 am'});
 assert.equal(r.clocks.length,2);assert.equal(r.fields.hour,'');
 for(const t of ['between 11 and midnight','before midnight'])assert.equal(collectTemporal({original:t,time:t}).fields.hour,'');
 assert.equal(parseTimeRange('2026/12/31 at 11:45 pm').earliest,1425);
 assert.equal(parseTimeRange('December 31, 2026'),null);
});
test('comparison uses canonical dates, keeps different years/days apart',()=>{
 const r=run('2026/12/31','December 31, 2026');assert.equal(r.status,'CONFLICT_SUPPORTED');
 assert.equal(r.temporal.claim1.display,'2026/12/31 23/');
 assert.equal(run("New Year's Eve 2026",'2026/12/31').status,'CONFLICT_SUPPORTED');
 for(const other of ['2025/12/31','2026/12/30','December 31'])assert.equal(run('2026/12/31',other).status,'NOT_EVALUABLE');
 assert.equal(run('Monday 2026/12/31','Monday 2025/12/31').status,'NOT_EVALUABLE');
});
test('normalized metadata from Claude cannot set dates or scores; grounding still enforced',()=>{
 const r=run('2026/12/31','December 31, 2026');
 for(const type of ['DIRECT','INFERENTIAL','FALSE_POSITIVE'])assert.equal(run('2026/12/31','December 31, 2026',type).score,r.score);
 const a=claim('I arrived at 11 pm.','11 pm'),b=claim('I arrived at 7 pm.','7 pm');
 const c={type:'DIRECT',claim1:a,claim2:b,temporal:{claim1:{fields:{year:'1900'}}}};
 const invalid=assessCandidate(c,'A: Nothing here','A: I arrived at 7 pm.');
 assert.equal(invalid.score,null);assert.equal(invalid.temporal.claim1.fields.year,'');
});

test('location rules use the same calendar normalization',()=>{
 const a={...claim('I was at the library on 2026/12/31 at 11 pm.','11 pm'),locationPhrase:'library'};
 const b={...claim('I was at the gym on December 31, 2026 at 11 pm.','11 pm'),locationPhrase:'gym'};
 const r=assessCandidate({type:'DIRECT',claim1:a,claim2:b},'A: '+a.original,'A: '+b.original);
 assert.equal(r.status,'CONFLICT_SUPPORTED');
 assert.ok(r.rulesFired.some(x=>x.id==='point-location'));
 assert.equal(parseTimeRange('12/11/2026 at 11 pm'),null);
});
