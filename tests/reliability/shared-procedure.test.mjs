import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessCandidate} from '../../server/humanConfidencePipeline.js';
import {directWireSchema} from '../../server/directOutput.js';

const shared=readFileSync(new URL('../../server/proper_prompts.md',import.meta.url),'utf8');
const types=['DIRECT','INFERENTIAL','NEEDS_REVIEW','FALSE_POSITIVE'];

// One classification procedure; the double-check reads the same text up to "## 6. Required Output".
test('the classification procedure has every step and the label set',()=>{
 const definitions=shared.slice(0,shared.indexOf('## 6. Required Output'));
 for(const heading of ['### Step 2: List every difference','### Step 4: The core test','### Step 5: Which type of conflict?','### Step 6: Consistency check','### Step 7: Record your answers','### Missing facts'])assert.ok(definitions.includes(heading),heading);
 assert.deepEqual(directWireSchema.properties.contradictions.items.properties.type.enum,types);
});
test('the shared procedure bans imagined reconciliations and the old imperfect-memory default',()=>{
 assert.match(shared,/You may NOT reconcile with any distinction the witness did not draw/);
 assert.match(shared,/choose FALSE_POSITIVE only if you can name which of reconciliations 1–7 applies/);
 assert.doesNotMatch(shared,/Could a person with an imperfect memory reasonably say both statements/);
 assert.doesNotMatch(shared,/Keep the existing three types/);
});
const claim=original=>({original,activityPhrase:null,timePhrase:null,locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,statePhrase:null,qualifierPhrases:[]});
test('the old method accepts NEEDS_REVIEW and never scores it',()=>{
 const a='I signed the form.',b='I did not sign the form.';
 const r=assessCandidate({type:'NEEDS_REVIEW',reasoning:'Fictional: which form is unclear.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign it?\nA: ${a}`,`Q: Did you sign it?\nA: ${b}`);
 assert.equal(r.type,'NEEDS_REVIEW');assert.equal(r.humanConfidence,null);assert.equal(r.status,'NOT_EVALUABLE');assert.equal(r.notEvaluableReason,'NEEDS_REVIEW');assert.equal(r.flag,'REVIEW');
 const d=assessCandidate({type:'DIRECT',reasoning:'Fictional affirm versus deny.',claim1:claim(a),claim2:claim(b)},`Q: Did you sign it?\nA: ${a}`,`Q: Did you sign it?\nA: ${b}`);
 assert.notEqual(d.notEvaluableReason,'NEEDS_REVIEW');
 assert.throws(()=>assessCandidate({type:'MAYBE',reasoning:'x',claim1:claim(a),claim2:claim(b)},a,b));
});
