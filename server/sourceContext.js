// Only literal question context; no model reasoning or inferred calendar values.
const date=/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|New Year['’]s (?:Eve|Day)|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/i;
const daypart=/\b(?:evening|night|morning|afternoon)\b/i;
const reset=/\b(?:another|different|separate)\s+(?:occasion|day|event|incident|matter)\b|\bunrelated matter\b|\b(?:move on|turn to|switch topics|new topic|changing subjects)\b/i;
const followUp=/\b(?:that (?:day|night|evening|morning|afternoon|occasion|event|time)|same (?:day|night|event)|then|after that|before that|when you|you (?:said|mentioned|testified)|what time|how long)\b/i;
export function boundedQuestionContext(questions=[]) {
 const current=questions.at(-1)??'';
 if(!current)return '';
 if(date.test(current)||reset.test(current)||/\b(?:now|currently|today|at present)\b/i.test(current))return current;
 if(!followUp.test(current))return current;
 // A reference must remain within a small uninterrupted conversational frame.
 const recent=questions.slice(-4),boundary=recent.findLastIndex(q=>reset.test(q));
 const frame=recent.slice(Math.max(0,boundary));
 const dated=frame.findLast(q=>date.test(q)),period=frame.findLast(q=>daypart.test(q));
 return [...new Set([dated,period,current].filter(Boolean))].join(' ');
}
export function conditionalAssertion(fact) {
 let statement=String(fact.sourceStatement||fact.original||'').toLowerCase().replace(/’/g,"'");
 const question=String(fact.sourceQuestion??'').toLowerCase();
 // Idiomatic uncertainty is not a hypothetical event. Preserve every other
 // conditional/modal so shortened extractions cannot evade the guard.
 statement=statement.replace(/\b(?:i (?:would (?:have to )?say|would think|would guess)|i'd say)\b/g,'i think');
 if(/\b(?:if|unless|suppose|supposing|assuming|hypothetically)\b/.test(statement))return true;
 if(!/\b(?:would|wouldn't)\b/.test(statement))return false;
 const habitual=/\b(?:usually|normally|typically|routinely|every (?:day|week|month|year)|each (?:day|week|month|year)|used to|regularly)\b/.test(`${question} ${statement}`);
 if(habitual&&!/\b(?:if|unless|suppose|supposing|assuming|hypothetically|would have)\b/.test(`${question} ${statement}`))return false;
 return true;
}
