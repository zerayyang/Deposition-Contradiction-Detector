// The AI reads; code decides. For each pair the AI answers small, checkable questions
// in `decision`; the fixed rules below turn those answers into one of the assignment's
// three types (DIRECT / INFERENTIAL / FALSE_POSITIVE). The same answers always give the
// same type, for both analysis methods. The AI's own `type` is kept only for audit.
import {parseTimeRange,parseQuantityRange} from './scoring/parsers.js';

export const RECONCILIATIONS=Object.freeze(['DIFFERENT_STATED_SCOPE','CORRECTION_OR_QUALIFICATION','NARROWER_QUESTION',
  'OVERLAPPING_APPROXIMATIONS','UNCERTAIN_RECOLLECTION','LATER_OPINION_OR_LEARNED','ADDED_DETAIL','NONE']);
export const CONFLICT_FORMS=Object.freeze(['AFFIRM_VS_DENY','DIFFERENT_EXACT_VALUES','EXHAUSTIVE_VS_EXCEPTION',
  'REQUIRES_INFERENCE','NON_OVERLAPPING_APPROXIMATIONS','NONE']);
const DIRECT_FORMS=new Set(['AFFIRM_VS_DENY','DIFFERENT_EXACT_VALUES','EXHAUSTIVE_VS_EXCEPTION']);
const INFERENTIAL_FORMS=new Set(['REQUIRES_INFERENCE','NON_OVERLAPPING_APPROXIMATIONS']);
const VALUE_FORMS=new Set(['DIFFERENT_EXACT_VALUES','NON_OVERLAPPING_APPROXIMATIONS']);
// Plain strings (empty when not applicable) keep the provider schema within its union limit.
const text={type:'string'};

// Property order is the order the model answers in: subject, circumstances, compatibility,
// form of the clash, the literal values compared, then any missing fact. Label last.
export const decisionSchema=Object.freeze({type:'object',additionalProperties:false,
  required:['sameSubject','sameCircumstances','circumstancesQuote','canBothBeTrue','reconciliation','reconciliationQuote','conflictForm','value1','value2','missingFact'],
  properties:{sameSubject:{type:'string',enum:['YES','NO','UNCLEAR']},
    sameCircumstances:{type:'string',enum:['SAME','DIFFERENT_STATED','NOT_STATED']},circumstancesQuote:text,
    canBothBeTrue:{type:'string',enum:['YES','NO']},
    reconciliation:{type:'string',enum:[...RECONCILIATIONS]},reconciliationQuote:text,
    conflictForm:{type:'string',enum:[...CONFLICT_FORMS]},value1:text,value2:text,missingFact:text}});

const normalize=value=>String(value??'').normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
  .replace(/[‐-―]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
const words=value=>value.replaceAll('_',' ').toLowerCase();
const plural=kind=>kind==='quantity'?'quantities':`${kind}s`;

// Quoted support only counts when the words really are in the record.
export function quoteFound(quote,sourceTexts){
  const q=normalize(quote);
  return q.length>=3&&sourceTexts.some(source=>normalize(source).includes(q));
}

// A compared value ("9", "8 PM") must appear in the record as whole words.
export function valueFound(value,sourceTexts){
  const v=normalize(value);
  if(!v)return false;
  const pattern=new RegExp(`(?:^|[^a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![a-z0-9])`);
  return sourceTexts.some(source=>pattern.test(normalize(source)));
}

// Approximate values this far apart are a plain contradiction, not one that needs reasoning:
// the larger amount is at least 1.5 times the smaller, or the times are 2+ hours apart
// (compared at the middle of each range).
export const FAR_APART_RATIO=1.5,FAR_APART_MINUTES=120;
const middle=r=>(r.earliest+r.latest)/2;
// "$", "dollars" and "of dollars" are the same unit.
const unitOf=unit=>/^(?:\$|(?:of )?(?:us )?dollars?|usd)$/i.test(String(unit??'').trim())?'$':unit;

// Code, not the model, compares times and quantities: parse both literal values and
// check whether their ranges overlap. Returns null when code cannot read both values.
export function compareValues(value1,value2){
  const exact=r=>r.earliest===r.latest&&!r.widenedBy;
  const times=[value1,value2].map(v=>parseTimeRange(v));
  if(times.every(t=>t&&Number.isFinite(t.earliest)&&Number.isFinite(t.latest))){
    const overlap=times[0].earliest<=times[1].latest&&times[1].earliest<=times[0].latest;
    return {kind:'time',overlap,exact:times.every(exact),farApart:!overlap&&Math.abs(middle(times[0])-middle(times[1]))>=FAR_APART_MINUTES};
  }
  const amounts=[value1,value2].map(v=>parseQuantityRange(v));
  if(amounts.every(Boolean)&&unitOf(amounts[0].unit)===unitOf(amounts[1].unit)){
    const overlap=amounts[0].earliest<=amounts[1].latest&&amounts[1].earliest<=amounts[0].latest;
    const [low,high]=amounts.map(middle).sort((a,b)=>a-b);
    return {kind:'quantity',overlap,exact:amounts.every(exact),farApart:!overlap&&low>0&&high/low>=FAR_APART_RATIO};
  }
  return null;
}

// Older saved decisions used one `sameFact` question; read it as the subject question.
const upgrade=d=>d&&!d.sameSubject&&d.sameFact?{sameCircumstances:'SAME',circumstancesQuote:'',value1:'',value2:'',...d,sameSubject:d.sameFact}:d;

// Fixed rules, in order. Returns the type, the plain-language rule that produced it, and
// a review note when the AI said a needed fact is missing (shown to the reviewer; it
// never changes the type).
export function deriveType(decision,sourceTexts=[]){
  const d=upgrade(decision)??{};
  const missing=typeof d.missingFact==='string'&&d.missingFact.trim()?d.missingFact.trim():'';
  const reviewNote=missing||(d.sameSubject==='UNCLEAR'?'Whether both statements are about the same thing is unclear.':'');
  const done=(type,rule,extra={})=>({type,rule,reviewNote:reviewNote||null,...extra});
  if(d.sameSubject==='NO')return done('FALSE_POSITIVE','Different subjects: the statements are not about the same person, thing or act.');
  const circumstancesVerified=d.sameCircumstances==='DIFFERENT_STATED'&&quoteFound(d.circumstancesQuote,sourceTexts);
  if(circumstancesVerified)return done('FALSE_POSITIVE','Different circumstances (time, occasion or scope) stated in the testimony.',{circumstancesVerified:true});
  const named=d.canBothBeTrue==='YES'&&RECONCILIATIONS.includes(d.reconciliation)&&d.reconciliation!=='NONE';
  const reconciliationVerified=named?quoteFound(d.reconciliationQuote,sourceTexts):null;
  if(reconciliationVerified)return done('FALSE_POSITIVE',`Both can be true: ${words(d.reconciliation)}, supplied by the witness's words.`,{reconciliationVerified});
  if(VALUE_FORMS.has(d.conflictForm)&&valueFound(d.value1,sourceTexts)&&valueFound(d.value2,sourceTexts)){
    const values=compareValues(d.value1,d.value2);
    if(values){
      if(values.overlap)return done('FALSE_POSITIVE',`Code check: the ${plural(values.kind)} "${d.value1}" and "${d.value2}" overlap.`,{valueCheck:values,reconciliationVerified});
      if(values.exact)return done('DIRECT',`Code check: different exact ${plural(values.kind)} "${d.value1}" and "${d.value2}".`,{valueCheck:values,reconciliationVerified});
      if(values.farApart)return done('DIRECT',`Code check: approximate ${plural(values.kind)} "${d.value1}" and "${d.value2}" are far apart.`,{valueCheck:values,reconciliationVerified});
      return done('INFERENTIAL',`Code check: approximate ${plural(values.kind)} "${d.value1}" and "${d.value2}" do not overlap.`,{valueCheck:values,reconciliationVerified});
    }
  }
  if(DIRECT_FORMS.has(d.conflictForm))return done('DIRECT',`Direct conflict: ${words(d.conflictForm)}.`,{reconciliationVerified});
  if(INFERENTIAL_FORMS.has(d.conflictForm))return done('INFERENTIAL',`Conflict by inference: ${words(d.conflictForm)}.`,{reconciliationVerified});
  if(d.canBothBeTrue==='NO')return done('INFERENTIAL','The statements cannot both be true, but no explicit opposition was identified.',{reconciliationVerified});
  return done('FALSE_POSITIVE','No conflict identified between the statements.',{reconciliationVerified});
}

// Applies the rules to a model finding. Without a decision (older saved results) the
// model's own type is kept unchanged.
export function applyDecision(finding,sourceTexts){
  if(!finding?.decision)return finding;
  const derived=deriveType(finding.decision,sourceTexts);
  return {...finding,modelType:finding.type,type:derived.type,typeRule:derived.rule,reviewNote:derived.reviewNote,
    reconciliationVerified:derived.reconciliationVerified??null,...(derived.valueCheck?{valueCheck:derived.valueCheck}:{})};
}
