import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {summarizeConfidence,CURRENT_COMBINATION_METHOD} from '../../shared/hybridConfidence.js';

const html=await readFile(new URL('../../public/hybrid-confidence-demo.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function demo() {
  const elements=new Map();
  for(const id of ['votes','review','objection','code','source','agree','dots','score','ring','vote-points','review-points','code-points','formula','normalization','available-explanation','vote-math','review-math','code-math','notice','reset','low-example'])
    elements.set(id,{value:id==='votes'?'5':id==='code'?'supported':'',checked:['review','source'].includes(id),events:{},
      addEventListener(event,handler){this.events[event]=handler;},setAttribute(){},style:{setProperty(){}}});
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)}});
  vm.runInContext(script,context);
  return {elements,calculate:input=>context.calculateDemo(input)};
}
test('demo arithmetic matches the production v2 policy across 168 combinations',()=>{
  const {calculate}=demo();let count=0;
  for(let votes=0;votes<=6;votes++)for(const reviewerAgrees of [false,true])for(const objections of [false,true])
    for(const code of ['supported','conflicting','unknown'])for(const sourcesVerified of [false,true]) {
      const production=summarizeConfidence({originalType:'DIRECT',combinationMethod:CURRENT_COMBINATION_METHOD,
        votes:Array.from({length:6},(_,i)=>({model:i<3?'a':'b',permutation:i%3,status:'SUCCESS',type:i<votes?'DIRECT':'FALSE_POSITIVE'})),
        reviewer:{status:'SUCCESS',type:reviewerAgrees?'DIRECT':'FALSE_POSITIVE',objections:objections?['Synthetic concern']:[]},
        evidence:{sourcesVerified,status:code==='supported'?'CONFLICT_SUPPORTED':code==='conflicting'?'COMPATIBLE_SUPPORTED':'NOT_EVALUABLE',ruleStrength:1}});
      assert.equal(calculate({votes,reviewerAgrees,objections,code,sourcesVerified}).score,production.score);count++;
    }
  assert.equal(count,168);
});
test('interactive controls show 90 percent, the honest 22 percent example and a source-failure dash',()=>{
  const {elements}=demo();assert.equal(elements.get('score').textContent,'90%');
  elements.get('low-example').events.click();assert.equal(elements.get('score').textContent,'22%');
  elements.get('source').checked=false;elements.get('source').events.input();assert.equal(elements.get('score').textContent,'—');
  elements.get('reset').events.click();assert.equal(elements.get('score').textContent,'90%');
  assert.match(html,/not a fitted statistical calibrator/);assert.doesNotMatch(html,/Math\.exp|made-up weights/);
});
test('visible formula explains the earned points, denominator and exclusion as controls change',()=>{
  const {elements}=demo();
  assert.equal(elements.get('vote-math').textContent,'5 ÷ 6 × 60 = 50 points');
  assert.equal(elements.get('formula').textContent,'50 + 30 + 10 = 90 points');
  assert.equal(elements.get('normalization').textContent,'90 ÷ 100 × 100 = 90%');
  elements.get('low-example').events.click();
  assert.equal(elements.get('formula').textContent,'20 + 0 = 20 points');
  assert.equal(elements.get('normalization').textContent,'20 ÷ 90 × 100 = 22%');
  assert.match(elements.get('available-explanation').textContent,/90 available points, not 100/);
  assert.match(elements.get('code-math').textContent,/excluded/);
  elements.get('source').checked=false;elements.get('source').events.input();
  assert.equal(elements.get('normalization').textContent,'No score until the quotes are verified.');
});
