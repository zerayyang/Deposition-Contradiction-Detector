import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEventJson} from '../../server/events/jsonTransport.js';
import {parseExtractionMessage} from '../../server/events/extractionProtocol.js';
import {parseComparisonMessage} from '../../server/events/comparisonProtocol.js';
test('only a whole JSON fence is decoded, without modifying strings or source typography',()=>{
 for(const header of ['','json','JSON']){
  const value={schemaVersion:1,events:[],units:[]},raw='```'+header+'\n'+JSON.stringify(value)+'\n```';
  const m={stop_reason:'end_turn',content:[{type:'text',text:raw}]};assert.deepEqual(parseExtractionMessage(m),value);assert.equal(decodeEventJson(raw).format,'MARKDOWN_JSON_FENCE');
 }
 const value={schemaVersion:1,rows:[]};assert.deepEqual(parseComparisonMessage({stop_reason:'end_turn',content:[{type:'text',text:'```json\n'+JSON.stringify(value)+'\n```'}]}),value);
 const quoted={quote:'A: “I did not.”\nI kept `ticks`.'};assert.deepEqual(decodeEventJson(JSON.stringify(quoted)).value,quoted);
});
test('prose, stitched fences, incomplete JSON and output truncation remain failures',()=>{
 for(const raw of ['Here it is: {}','```json\n{}','```json\n{}\n```\nExtra','{}{}','```json\n{broken}\n```'])assert.throws(()=>decodeEventJson(raw));
 assert.throws(()=>parseExtractionMessage({stop_reason:'max_tokens',content:[{type:'text',text:'{}'}]}),/Incomplete/);
 assert.throws(()=>parseExtractionMessage({stop_reason:'end_turn',content:[{type:'text',text:'```json\n{"confidence":99}\n```'}]}),/envelope/);
});

test('provider schema retains enums, resolves only used definitions, and does not mutate local rules',async()=>{
 const {providerOutputFormat}=await import('../../server/events/structuredOutput.js');
 const {extractionWireSchema}=await import('../../server/events/extractionProtocol.js');
 const before=JSON.stringify(extractionWireSchema),format=providerOutputFormat(extractionWireSchema);
 assert.equal(JSON.stringify(extractionWireSchema),before);assert.deepEqual(format.schema.properties.schemaVersion.enum,[1]);
 assert.deepEqual(Object.keys(format.schema.$defs).sort(),['assertion','attribute','event','qualifier','relation','source']);
 assert.deepEqual(format.schema.$defs.attribute.properties.state.enum,['STATED','UNSTATED','AMBIGUOUS']);assert.equal(format.schema.properties.events.items.$ref,'#/$defs/event');
 assert.ok(!JSON.stringify(format).includes('segment'));assert.equal(format.schema.$defs.event.additionalProperties,false);
});
