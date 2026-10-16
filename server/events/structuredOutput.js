import {jsonSchemaOutputFormat} from '@anthropic-ai/sdk/helpers/json-schema';
function normalize(value){
 if(Array.isArray(value))return value.map(normalize);
 if(!value||typeof value!=='object')return value;
 const result=Object.fromEntries(Object.entries(value).map(([key,v])=>[key==='definitions'?'$defs':key,key==='$ref'?v.replace('#/definitions/','#/$defs/'):normalize(v)]));
 if(Object.hasOwn(result,'const')){result.enum=[result.const];delete result.const;}
 if(result.enum&&!result.type)result.type=Number.isInteger(result.enum[0])?'integer':typeof result.enum[0];
 return result;
}
function preserveEnums(original,target){
 if(!original||typeof original!=='object'||!target||typeof target!=='object')return;
 if(original.enum)target.enum=original.enum;
 for(const key of Object.keys(original))if(key in target)preserveEnums(original[key],target[key]);
}
// Normalize draft-07 definitions for the official SDK, transform only transport
// constraints, and retain enums. The original full local validators remain authoritative.
export function providerOutputFormat(schema){
 const normalized=normalize(schema);
 const definitions=normalized.$defs;delete normalized.$defs;
 if(definitions){
  const needed=new Set();
  function references(value){if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(key==='$ref'&&v.startsWith('#/$defs/'))needed.add(v.slice(8));else references(v);}}
  references(normalized);const checked=new Set();
  while([...needed].some(key=>!checked.has(key)))for(const key of needed)if(!checked.has(key)){checked.add(key);if(!definitions[key])throw new Error('Unknown structured output definition.');references(definitions[key]);}
  normalized.$defs=Object.fromEntries([...needed].map(key=>[key,definitions[key]]));
 }
 const format=jsonSchemaOutputFormat(normalized);
 preserveEnums(normalized,format.schema);
 return {type:format.type,schema:format.schema};
}
