import {providerOutputFormat} from './events/structuredOutput.js';
const strings={type:'array',items:{type:'string'}};
const nullable={type:['string','null']};
const claimProperties={original:{type:'string'},sourceQuestion:nullable,sourceAnswer:nullable,activityPhrase:nullable,timePhrase:nullable,locationPhrase:nullable,personPhrase:nullable,objectPhrase:nullable,quantityPhrase:nullable,statePhrase:nullable,qualifierPhrases:strings};
const claim={type:'object',additionalProperties:false,required:Object.keys(claimProperties),properties:claimProperties};
export const directWireSchema={type:'object',additionalProperties:false,required:['topicsReviewed','contradictions'],properties:{topicsReviewed:strings,contradictions:{type:'array',items:{type:'object',additionalProperties:false,required:['claim1','claim2','reasoning','type','severity','semanticAssist'],properties:{claim1:{$ref:'#/definitions/claim'},claim2:{$ref:'#/definitions/claim'},reasoning:{type:'string'},type:{type:'string',enum:['DIRECT','INFERENTIAL','NEEDS_REVIEW','FALSE_POSITIVE']},severity:{type:'string',enum:['HIGH','MEDIUM','LOW']},semanticAssist:{type:'object',additionalProperties:false,required:['relationship','activity1Suggestions','activity2Suggestions'],properties:{relationship:{type:'string',enum:['MATCH','POSSIBLE_CONFLICT','UNRELATED','UNCERTAIN']},activity1Suggestions:strings,activity2Suggestions:strings}}}}}}};
// Provider-constrained JSON prevents malformed escaping; local source and scoring
// checks remain authoritative. A truncated or invalid response still fails closed.
directWireSchema.definitions={claim};
export const directOutputFormat=providerOutputFormat(directWireSchema);
