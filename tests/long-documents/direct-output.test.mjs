import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,directRequest,parseModelMessage} from '../../server/documentAnalysis.js';
import {directWireSchema} from '../../server/directOutput.js';
test('direct calls request provider-enforced existing JSON contract without model confidence fields',()=>{
 const plan=buildPlan(['Q: Did you sign?\nA: Yes.','Q: Did you sign?\nA: No.'],[],'instructions');
 const params=directRequest(plan,plan.chunks[0][0],plan.chunks[1][0],'instructions');assert.equal(params.output_config.format.type,'json_schema');assert.equal(params.output_config.effort,'medium');
 const fields=directWireSchema.properties.contradictions.items.properties;assert.deepEqual(fields.type.enum,['DIRECT','INFERENTIAL','NEEDS_REVIEW','FALSE_POSITIVE']);assert.equal(fields.score,undefined);assert.equal(fields.humanConfidence,undefined);assert.equal(directWireSchema.definitions.claim.additionalProperties,false);
});
test('a malformed or truncated response is never repaired into a successful result',()=>{
 assert.throws(()=>parseModelMessage({stop_reason:'end_turn',content:[{type:'text',text:'{"contradictions":["bad""quote"]}'}]}));
 assert.throws(()=>parseModelMessage({stop_reason:'max_tokens',content:[{type:'text',text:'{"contradictions":[]}'}]}),/incomplete/);
});

test('provider schema shares claim definitions and stays below the 16-union compilation limit',()=>{
 const plan=buildPlan(['I signed.','I did not sign.'],[],'instructions',{witnessTestimonyConfirmed:[true,true]});const schema=directRequest(plan,plan.chunks[0][0],plan.chunks[1][0],'instructions').output_config.format.schema;
 const count=v=>!v||typeof v!=='object'?0:(Array.isArray(v.type)||Array.isArray(v.anyOf)?1:0)+Object.values(v).reduce((n,x)=>n+(Array.isArray(x)?x.reduce((a,y)=>a+count(y),0):count(x)),0);
 assert.ok(count(schema)<=16);assert.equal(count(schema),9);assert.equal(schema.properties.contradictions.items.properties.claim1.$ref,schema.properties.contradictions.items.properties.claim2.$ref);
});
