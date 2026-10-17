import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeConflictingLabels} from '../../server/events/scoringAdapter.js';

// Fictional testimony only. Cards comparing the same witness answers with different
// labels become one review card; everything else is returned unchanged.
const texts=[
  'Q: Did you sign the lease?\nA: I signed the lease on Monday. I read it first.\nQ: Did you visit the site?\nA: I visited the site once.',
  'Q: Did you sign the lease?\nA: I never signed the lease. Someone else did.\nQ: Did you visit the site?\nA: I visited the site twice.'];
const plan={documents:texts.map(text=>({text,speakerRoles:{}}))};
const src=(i,quote)=>({role:'WITNESS',quote,start:texts[i].indexOf(quote),end:texts[i].indexOf(quote)+quote.length,pageRefs:[]});
let n=0;
const card=(type,leftQuote,rightQuote,extra={})=>({id:'c'+(n++),type,report:type!=='FALSE_POSITIVE',score:type==='FALSE_POSITIVE'?null:90,humanConfidence:type==='FALSE_POSITIVE'?null:90,
  status:'CONFLICT_SUPPORTED',flag:'NONE',reasons:[],reasoning:`Scripted ${type}.`,
  eventDetails:{issue:`Issue ${n}`,comparison:{leftSources:[src(0,leftQuote)],rightSources:[src(1,rightQuote)]}},...extra});

test('different labels on the same answers become one review card that keeps every view',()=>{
  const a=card('DIRECT','I signed the lease on Monday.','I never signed the lease.'),b=card('FALSE_POSITIVE','I read it first.','Someone else did.');
  const out=mergeConflictingLabels([a,b],plan);
  assert.equal(out.length,1);
  const [m]=out;
  assert.equal(m.labelDisagreement,true);assert.equal(m.report,true);assert.equal(m.flag,'REVIEW');
  assert.equal(m.type,'DIRECT');assert.deepEqual(m.typeAlternatives.sort(),['DIRECT','FALSE_POSITIVE']);
  assert.equal(m.score,null);assert.equal(m.humanConfidence,null);assert.equal(m.notEvaluableReason,'LABEL_DISAGREEMENT');
  assert.deepEqual(m.mergedViews.map(v=>v.id),[a.id,b.id]);
  assert.ok(m.mergedViews.every(v=>v.reasoning&&v.issue));
  assert.match(m.reasons[0],/Labels disagree/);
});

test('same-label cards on the same answers stay separate distinct issues',()=>{
  const a=card('DIRECT','I signed the lease on Monday.','I never signed the lease.'),b=card('DIRECT','I read it first.','Someone else did.');
  const out=mergeConflictingLabels([a,b],plan);
  assert.equal(out.length,2);assert.equal(out[0],a);assert.equal(out[1],b);
});

test('different labels on different answers stay separate',()=>{
  const a=card('DIRECT','I signed the lease on Monday.','I never signed the lease.'),b=card('FALSE_POSITIVE','I signed the lease on Monday.','I visited the site twice.');
  const out=mergeConflictingLabels([a,b],plan);
  assert.equal(out.length,2);assert.ok(out.every(c=>!c.labelDisagreement));
});

test('a chain of overlapping disagreements merges into one card; unrelated cards are untouched',()=>{
  const a=card('DIRECT','I signed the lease on Monday.','I never signed the lease.'),b=card('INFERENTIAL','I read it first.','Someone else did.'),
    c=card('FALSE_POSITIVE','I signed the lease on Monday.','Someone else did.'),other=card('INFERENTIAL','I visited the site once.','I visited the site twice.');
  const out=mergeConflictingLabels([a,b,c,other],plan);
  assert.equal(out.length,2);
  assert.equal(out[0].mergedViews.length,3);assert.deepEqual(out[0].typeAlternatives.sort(),['DIRECT','FALSE_POSITIVE','INFERENTIAL']);
  assert.equal(out[1],other);
});

test('cards without event details pass through unchanged',()=>{
  const legacy={id:'x',type:'DIRECT',report:true};
  assert.deepEqual(mergeConflictingLabels([legacy],plan),[legacy]);
});
