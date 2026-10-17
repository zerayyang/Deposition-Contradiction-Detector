// The AI answers a few small, checkable questions about each pair; this code turns
// those answers into the contradiction type. The same answers always give the same
// type, for both analysis methods. The AI's own `type` is kept only for audit.

export const RECONCILIATIONS=Object.freeze(['DIFFERENT_STATED_SCOPE','CORRECTION_OR_QUALIFICATION','NARROWER_QUESTION',
  'OVERLAPPING_APPROXIMATIONS','UNCERTAIN_RECOLLECTION','LATER_OPINION_OR_LEARNED','ADDED_DETAIL','NONE']);
export const CONFLICT_FORMS=Object.freeze(['AFFIRM_VS_DENY','DIFFERENT_EXACT_VALUES','EXHAUSTIVE_VS_EXCEPTION',
  'REQUIRES_INFERENCE','NON_OVERLAPPING_APPROXIMATIONS','NONE']);
const DIRECT_FORMS=new Set(['AFFIRM_VS_DENY','DIFFERENT_EXACT_VALUES','EXHAUSTIVE_VS_EXCEPTION']);
const INFERENTIAL_FORMS=new Set(['REQUIRES_INFERENCE','NON_OVERLAPPING_APPROXIMATIONS']);
// Plain strings (empty when not applicable) keep the provider schema within its union limit.
const optionalText={type:'string'};

// Property order is the order the model answers in: facts first, label last.
export const decisionSchema=Object.freeze({type:'object',additionalProperties:false,
  required:['sameFact','canBothBeTrue','reconciliation','reconciliationQuote','conflictForm','missingFact'],
  properties:{sameFact:{type:'string',enum:['YES','NO','UNCLEAR']},canBothBeTrue:{type:'string',enum:['YES','NO']},
    reconciliation:{type:'string',enum:[...RECONCILIATIONS]},reconciliationQuote:optionalText,
    conflictForm:{type:'string',enum:[...CONFLICT_FORMS]},missingFact:optionalText}});

const normalize=text=>String(text??'').normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
  .replace(/[‐-―]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();

// A reconciliation only counts when the words that supply it are really in the record.
export function quoteFound(quote,sourceTexts){
  const q=normalize(quote);
  return q.length>=3&&sourceTexts.some(text=>normalize(text).includes(q));
}

// Fixed rules, in order. Returns the type and the plain-language rule that produced it.
export function deriveType(decision,sourceTexts=[]){
  const d=decision??{},hasMissing=typeof d.missingFact==='string'&&d.missingFact.trim().length>0;
  if(d.sameFact==='NO')return {type:'FALSE_POSITIVE',rule:'Different facts: the statements are not about the same thing.',reconciliationVerified:null};
  if(d.sameFact==='UNCLEAR'&&hasMissing)return {type:'NEEDS_REVIEW',rule:`Undecidable from the testimony: ${d.missingFact.trim()}`,reconciliationVerified:null};
  const named=d.canBothBeTrue==='YES'&&RECONCILIATIONS.includes(d.reconciliation)&&d.reconciliation!=='NONE';
  const verified=named&&quoteFound(d.reconciliationQuote,sourceTexts);
  if(verified)return {type:'FALSE_POSITIVE',rule:`Both can be true: ${d.reconciliation.toLowerCase().replaceAll('_',' ')}, supplied by the witness's words.`,reconciliationVerified:true};
  if(DIRECT_FORMS.has(d.conflictForm))return {type:'DIRECT',rule:`Direct conflict: ${d.conflictForm.toLowerCase().replaceAll('_',' ')}.`,reconciliationVerified:named?false:null};
  if(INFERENTIAL_FORMS.has(d.conflictForm))return {type:'INFERENTIAL',rule:`Conflict by inference: ${d.conflictForm.toLowerCase().replaceAll('_',' ')}.`,reconciliationVerified:named?false:null};
  if(d.canBothBeTrue==='NO')return {type:'INFERENTIAL',rule:'The statements cannot both be true, but no explicit opposition was identified.',reconciliationVerified:null};
  return {type:'FALSE_POSITIVE',rule:'No conflict identified between the statements.',reconciliationVerified:named?false:null};
}

// Applies the rules to a model finding. Without a decision (older saved results) the
// model's own type is kept unchanged.
export function applyDecision(finding,sourceTexts){
  if(!finding?.decision)return finding;
  const derived=deriveType(finding.decision,sourceTexts);
  return {...finding,modelType:finding.type,type:derived.type,typeRule:derived.rule,reconciliationVerified:derived.reconciliationVerified};
}
