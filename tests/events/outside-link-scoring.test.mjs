import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreEventComparisons} from '../../server/events/scoringAdapter.js';

// Fictional testimony only. A reading-stage reference to testimony outside the read
// range may stop withholding the score only after comparison resolves it cleanly.
const a='I signed exactly three invoices that day.',b='I signed exactly five invoices that day. These are the same invoices I described before.';
const texts=[`Q: How many invoices did you sign that day?\nA: ${a}`,`Q: How many invoices did you sign that day?\nA: ${b}`];
const source=(i,quote)=>({id:'s'+i,role:'WITNESS',quote,start:texts[i].indexOf(quote),end:texts[i].indexOf(quote)+quote.length,pageRefs:[]});
const attr=(name,value,id)=>({name,state:'STATED',basis:'WITNESS_WORDS',value,sourceIds:[id]});

function build(change=x=>x){
  const sources=[source(0,a),source(1,b)];
  const events=[
    {id:'e0',kind:'signing',attributes:[attr('quantity','exactly three','s0'),attr('object','invoices','s0')],qualifiers:[],relations:[],reviewRequired:false,unresolvedReasons:[]},
    {id:'e1',kind:'signing',attributes:[attr('quantity','exactly five','s1'),attr('object','invoices','s1')],qualifiers:[],
      relations:[{kind:'QUALIFIES',targetEventId:null,explanation:'Refers to earlier testimony outside this request.'}],
      reviewRequired:true,unresolvedReasons:['Referenced testimony is outside this request.']}];
  const result={context:{sameWitnessConfirmed:true},
    catalogs:events.map((event,i)=>[{id:'g'+i,event}]),
    tasks:[{pairs:[{pairId:'p',relation:'RELATED',reviewRequired:true}],rejected:[]}],
    comparisons:[{id:'c',type:'DIRECT',report:true,reviewRequired:true,typeDisagreement:false,reportDisagreement:false,issue:'Invoice count',
      variants:[{pairId:'p',leftId:'g0',rightId:'g1',reasoning:'Scripted only.',missingContext:[]}],leftSources:[sources[0]],rightSources:[sources[1]]}]};
  change(result,events,sources);
  const [f]=scoreEventComparisons(result,{documents:texts.map(text=>({text,speakerRoles:{}}))});
  return f;
}

test('a resolved outside reference no longer withholds the score and keeps a review note',()=>{
  const f=build();
  assert.equal(f.claim1Valid,true);assert.equal(f.claim2Valid,true);
  assert.equal(typeof f.score,'number');
  assert.ok(f.rulesFired.some(r=>r.id==='quantity'&&r.verdict==='CONFLICT'));
  assert.equal(f.flag,'REVIEW');
  assert.ok(f.reasons.includes('Refers to other testimony; check the link.'));
});

const blockedCases={
  'a correction still blocks':(r,e)=>{e[1].relations[0].kind='CORRECTS';},
  'an in-document link with a target still blocks':(r,e)=>{e[1].relations[0].targetEventId='e9';},
  'missing context reported by comparison still blocks':r=>{r.comparisons[0].variants[0].missingContext=['Which invoices?'];},
  'a label disagreement still blocks':r=>{r.comparisons[0].typeDisagreement=true;},
  'a report disagreement still blocks':r=>{r.comparisons[0].reportDisagreement=true;},
  'an unresolved pair still blocks':r=>{r.tasks[0].pairs[0].relation='UNRESOLVED';},
  'a coverage conflict still blocks':r=>{r.tasks[0].pairs[0].coverageConflict=true;},
  'a rejected comparison in the pair still blocks':r=>{r.tasks[0].rejected=[{pairId:'p'}];},
  'unconfirmed same witness still blocks':r=>{r.context.sameWitnessConfirmed=false;},
  'an ambiguous attribute still blocks':(r,e)=>{e[1].attributes.push({name:'date',state:'AMBIGUOUS',basis:'NONE',value:null,sourceIds:['s1']});},
  'extra unresolved reasons beyond the link still block':(r,e)=>{e[1].unresolvedReasons.push('Pronoun referent unclear.');},
  'review without any relation still blocks':(r,e)=>{e[1].relations=[];},
  'two witness passages on one side still block':(r,e,s)=>{r.comparisons[0].rightSources=[s[1],{...s[1],id:'s2'}];},
};
for(const [name,change] of Object.entries(blockedCases))test(name,()=>{
  const f=build(change);
  assert.equal(f.score,null,name);assert.equal(f.status,'NOT_EVALUABLE',name);assert.equal(f.flag,'REVIEW',name);
});
