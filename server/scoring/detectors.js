// Five deterministic evidence detectors for a pair of witness answers. No AI and no
// external data: small owner-controlled word lists and the existing parsers. This layer
// is separate from the live score (engine.js) until the owner approves using it.
//
// score = 100 x evidence x (0.5 + 0.5 x commitment), the same formula as the live engine.
import {parseTimeRange,parseQuantityRange} from './parsers.js';
import {analyzeCommitment} from './language.js';
import {SCORING_CONFIG} from './config.js';

const STOP=new Set('a an the and or but if of to in on at by for from with about as is are was were be been being do does did done have has had i you he she it we they me him her us them my your his its our their this that these those there here then than so just very really okay ok well uh um like what when where who whom which why how any some'.split(' '));
const NEGATORS=new Set(['not','no','never','nobody','nothing','none','neither','nor','cannot','without']);
const EXHAUSTIVE=['only','just','nobody else','no one else','nothing else','no other','never','none','not once','all of','every','the only','that\'s it','that is it','just them','only them'];
const YES=/^(?:yes|yeah|yep|yup|correct|that's correct|that is correct|right|that's right|true|i did|i was|i do|i have|absolutely|definitely|sure)\b/;
const NO=/^(?:no|nope|never|not|i did not|i didn't|i was not|i wasn't|i do not|i don't|i have not|i haven't|that's not|that is not|incorrect|wrong|none)\b/;
const IRREGULAR={went:'go',gone:'go',saw:'see',seen:'see',told:'tell',said:'say',gave:'give',given:'give',took:'take',taken:'take',
  met:'meet',left:'leave',knew:'know',known:'know',came:'come',got:'get',gotten:'get',made:'make',paid:'pay',sent:'send',spoke:'speak',
  spoken:'speak',wrote:'write',written:'write',bought:'buy',sold:'sell',heard:'hear',felt:'feel',ran:'run',drove:'drive',driven:'drive',
  ate:'eat',drank:'drink',signed:'sign',thought:'think',found:'find',kept:'keep',held:'hold',brought:'bring',began:'begin',was:'be',were:'be'};

const clean=text=>String(text??'').toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
const expand=text=>clean(text).replace(/\b(\w+)n't\b/g,(_,w)=>`${w==='ca'?'can':w==='wo'?'will':w} not`);
const stem=word=>IRREGULAR[word]??word.replace(/(?:ing|ed|es|s)$/,'').replace(/(.)\1$/,'$1');
const tokens=text=>expand(text).match(/[a-z0-9']+/g)??[];
// Content words of an answer: negation and filler removed, verbs reduced to a base form.
export function contentWords(text){return new Set(tokens(text).filter(w=>!STOP.has(w)&&!NEGATORS.has(w)&&w.length>1).map(stem));}
export function isNegated(text){return tokens(text).some(w=>NEGATORS.has(w));}
const jaccard=(a,b)=>{if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n);};
export function polarity(answer){
  const a=clean(answer).replace(/^[\s,.-]+/,'');
  if(NO.test(a))return 'NO';
  if(YES.test(a))return 'YES';
  return null;
}

// 1. The same question answered yes in one deposition and no in the other.
function sameQuestionYesNo(p){
  if(!p.question1||!p.question2)return null;
  const similarity=jaccard(contentWords(p.question1),contentWords(p.question2));
  const [a,b]=[polarity(p.answer1),polarity(p.answer2)];
  if(similarity<0.6||!a||!b)return null;
  return a!==b?{id:'same-question-yes-no',verdict:'CONFLICT',strength:0.95,explanation:`Near-identical questions (${Math.round(similarity*100)}% shared words) answered ${a} and ${b}.`}
    :{id:'same-question-yes-no',verdict:'COMPATIBLE',strength:0.9,explanation:`Near-identical questions answered ${a} both times.`};
}
// 2. The same statement made once with and once without a negation.
function negationFlip(p){
  const [w1,w2]=[contentWords(p.answer1),contentWords(p.answer2)];
  if(w1.size<2||w2.size<2)return null;
  const overlap=jaccard(w1,w2),n1=isNegated(p.answer1),n2=isNegated(p.answer2);
  if(overlap<0.6||n1===n2)return null;
  return {id:'negation-flip',verdict:'CONFLICT',strength:0.9,explanation:`Same statement (${Math.round(overlap*100)}% shared words) affirmed in one answer and negated in the other.`};
}
// 3. "Only / never / nobody else" in one answer, a new person or item in the other.
const names=text=>new Set((String(text??'').match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)??[]).filter(n=>!['I','Q','A','Yes','No','Okay','Mr','Ms','Mrs','Dr'].includes(n)).map(n=>n.toLowerCase()));
function exhaustiveException(p){
  const pairs=[[p.answer1,p.answer2],[p.answer2,p.answer1]];
  for(const [closed,other] of pairs){
    const c=clean(closed),marker=EXHAUSTIVE.find(m=>new RegExp(`(?<![a-z])${m.replace(/'/g,"'")}(?![a-z])`).test(c));
    if(!marker||isNegated(other))continue;
    const topic=jaccard(contentWords(p.question1??'').size?contentWords(`${p.question1} ${p.question2}`):new Set(),contentWords(`${closed} ${other}`));
    const shared=jaccard(contentWords(closed),contentWords(other));
    const added=[...names(other)].filter(n=>!clean(closed).includes(n));
    if(added.length&&(shared>=0.15||topic>=0.2))return {id:'exhaustive-exception',verdict:'CONFLICT',strength:0.8,
      explanation:`"${marker}" closes the list in one answer; the other adds ${added.slice(0,3).join(', ')}.`};
  }
  return null;
}
// 4. Times and quantities compared by the existing parsers.
const TIME=/\b(?:(?:around|about|approximately|roughly|maybe)\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|noon|midnight)/gi;
const AMOUNT=/\b(?:(?:around|about|approximately|roughly|maybe|over|under)\s+)?(?:\$?\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)(?:\s+or\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten))?\s+[a-z]+/gi;
function overlaps(a,b){return a.earliest<=b.latest&&b.earliest<=a.latest;}
const exact=r=>r.earliest===r.latest&&!r.widenedBy;
function values(p){
  for(const [kind,pattern,parse] of [['time',TIME,v=>parseTimeRange(v)],['quantity',AMOUNT,v=>parseQuantityRange(v)]]){
    const found=[p.answer1,p.answer2].map(t=>[...String(t??'').matchAll(pattern)].map(m=>({text:m[0],value:parse(m[0])})).filter(x=>x.value&&Number.isFinite(x.value.earliest)));
    if(!found[0].length||!found[1].length)continue;
    for(const a of found[0])for(const b of found[1]){
      if(kind==='quantity'&&a.value.unit!==b.value.unit)continue;
      if(overlaps(a.value,b.value))return {id:'values',verdict:'COMPATIBLE',strength:0.8,explanation:`${kind} "${a.text}" and "${b.text}" overlap.`};
      return exact(a.value)&&exact(b.value)?{id:'values',verdict:'CONFLICT',strength:1,explanation:`Different exact ${kind}s "${a.text}" and "${b.text}".`}
        :{id:'values',verdict:'CONFLICT',strength:0.7,explanation:`Approximate ${kind}s "${a.text}" and "${b.text}" do not overlap.`};
    }
  }
  return null;
}
// 5. Commitment: the existing memory / hedge / certainty lists (language.js).
// The whole answer is the target, so every hedge or certainty word in it counts.
export function commitmentOf(answer){const text=String(answer??'');return analyzeCommitment({original:text},[text],SCORING_CONFIG).commitment;}

export const DETECTORS=Object.freeze([sameQuestionYesNo,negationFlip,exhaustiveException,values]);
export function detectEvidence(pair){
  const fired=DETECTORS.map(d=>d(pair)).filter(Boolean);
  const conflicts=fired.filter(f=>f.verdict==='CONFLICT'),compatible=fired.filter(f=>f.verdict==='COMPATIBLE');
  const commitment=Math.min(commitmentOf(pair.answer1),commitmentOf(pair.answer2));
  if(conflicts.length){
    const evidence=Math.max(...conflicts.map(f=>f.strength));
    return {status:'CONFLICT',score:Math.round(100*evidence*(0.5+0.5*commitment)),evidence,commitment,fired};
  }
  if(compatible.length)return {status:'COMPATIBLE',score:Math.min(15,Math.round(15*Math.max(...compatible.map(f=>f.strength)))),evidence:0,commitment,fired};
  return {status:'NOT_EVALUABLE',score:null,evidence:null,commitment,fired};
}
