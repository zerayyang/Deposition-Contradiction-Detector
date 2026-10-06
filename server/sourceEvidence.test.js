import assert from "node:assert/strict";
import { validateClaim } from "./evidenceValidator.js";
import { witnessQuoteMatches } from "./sourceEvidence.js";
import { assessCandidate } from "./humanConfidencePipeline.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { scoreFacts } from "./scoring/engine.js";

const claim = (original,fields={}) => ({original,activityPhrase:null,timePhrase:null,
    locationPhrase:null,personPhrase:null,objectPhrase:null,quantityPhrase:null,
    statePhrase:null,qualifierPhrases:[],...fields});
const qa = (answer,date="November 3rd",period="evening") =>
    `Q: What happened on the ${period} of ${date}?\nA: ${answer}`;
const home = "I was at home all evening.";
const departure = "I think I went out briefly to get some groceries, maybe around 7:30, but came right back.";
const assess = (first,second,t1=qa(first),t2=qa(second),fields1={},fields2={}) =>
    assessCandidate({type:"DIRECT",claim1:claim(first,fields1),claim2:claim(second,fields2)},t1,t2);

// Original sample, both candidate orderings and hedged language still work.
for (const [first,second] of [[home,departure],[departure,home]]) {
    const r=assess(first,second);
    assert.equal(r.score,84);
    assert.equal(r.status,"CONFLICT_SUPPORTED");
}
assert.equal(assess("I never left home all evening.","I went out briefly.").status,"CONFLICT_SUPPORTED");
assert.equal(assess(home,"I did not leave home.").status,"COMPATIBLE_SUPPORTED");

// Negation and comma-separated conditions/exceptions are not continuous presence.
for (const first of [
    "I was not at home all evening.",
    "I wasn't at home all evening.",
    "If I was at home all evening, I would have watched TV.",
    "If the rain continued, I was at home all evening.",
    "I was at home all evening, except for getting groceries.",
    "I was at home all evening apart from a short trip."
]) {
    for (const [a,b] of [[first,departure],[departure,first]]) {
        const r=assess(a,b);
        assert.equal(r.claim1Valid&&r.claim2Valid,true);
        assert.equal(r.score,null,first);
        assert.equal(r.status,"NOT_EVALUABLE",first);
    }
}
assert.equal(assess(home,"If I needed food, I went out briefly.").score,null);

// A model excerpt cannot remove governing negation or a condition in the source.
assert.equal(assess("at home all evening.",departure,
    qa("I was not at home all evening."),qa(departure)).score,null);
assert.equal(assess(home,"went out briefly.",qa(home),
    qa("I never went out briefly.")).status,"COMPATIBLE_SUPPORTED");
assert.equal(assess(home,"I went out briefly.",qa(home),
    qa("It is not true that I went out briefly.")).score,null);
assert.equal(assess(home,departure,
    qa(`If it rained, ${home}`),qa(departure)).score,null);
assert.equal(assess(home,departure,
    qa(`${home.slice(0,-1)}, except for a grocery trip.`),qa(departure)).claim1Valid,false);

// Extracted time values cannot bypass the hypothetical guard through another rule.
const hypotheticalTime=assess("If I left at 8 PM, I would have arrived earlier.","I left at 11 PM.",
    undefined,undefined,{timePhrase:"8 PM"},{timePhrase:"11 PM"});
assert.equal(hypotheticalTime.score,null);

// Matching text in a question is not witness testimony.
const examinerOnly=`Q: Did you say "${home}"?\nA: No.`;
assert.equal(validateClaim(claim(home),examinerOnly),false);
const examinerResult=assess(home,departure,examinerOnly,qa(departure));
assert.equal(examinerResult.score,null);
assert.equal(examinerResult.notEvaluableReason,"UNVERIFIED_SOURCE");
assert.equal(validateClaim(claim("at home.\nQ: Did you leave?"),
    "Q: Where were you?\nA: I was at home.\nQ: Did you leave?\nA: No."),false);

// Ignore examiner occurrences when the same quote also occurs in an answer.
const adopted=`Q: Did you say "${home}" on November 4th?\nA: No.\n\n${qa(home)}`;
assert.equal(witnessQuoteMatches(adopted,home).length,1);
assert.equal(assess(home,departure,adopted,qa(departure)).score,84);

// Multiline, indented and numbered Q/A sections preserve exact quote offsets.
const wrapped=`  12 q. Where were you on the evening\n      of November 3rd?\n  13 a. ${home}`;
assert.equal(assess(home,departure,wrapped,qa(departure)).score,84);
assert.equal(validateClaim(claim("I was home.\nI watched TV."),
    "Question: Where were you?\nAnswer: I was home.\nI watched TV."),true);

// Positive shared event context is required for this home/departure rule.
const unanchored=assess(home,departure,home,departure);
assert.equal(unanchored.score,null);
assert.equal(unanchored.notEvaluableReason,"MISSING_CONTEXT");
assert.equal(assess(home,departure,qa(home),qa(departure,"November 4th")).score,null);
assert.equal(assess(home,"I did not leave home.",qa(home),qa("I did not leave home.","November 4th")).score,null);
assert.equal(assess(home,"I went out briefly.",qa(home),qa("I went out briefly.","November 3rd","morning")).status,"COMPATIBLE_SUPPORTED");
assert.equal(assess(home,"I went out at 7:30 PM and had work the next morning.").status,"CONFLICT_SUPPORTED");
assert.equal(assess(home,"I went out at 7:30 PM.",qa(home),qa("I went out at 7:30 PM.","November 3rd","morning")).status,"CONFLICT_SUPPORTED");
assert.equal(assess("I was at home all morning.","I went out at 7 PM.",qa("I was at home all morning.","November 3rd","morning"),qa("I went out at 7 PM.")).status,"COMPATIBLE_SUPPORTED");
assert.equal(assess("It isn't true that I was at home all evening.",departure).score,null);
assert.equal(assess("My wife was at home all evening.",departure).score,null);
assert.equal(assess(home,"My wife went out briefly.").score,null);
const resetSource=`${qa("I drove around.")}\nQ: On another occasion, where were you?\nA: ${home}`;
assert.equal(assess(home,departure,resetSource,qa(departure)).score,null);
const newAnchor=`${qa("I drove around.")}\nQ: On a different day, November 4th, where were you that evening?\nA: ${home}`;
assert.equal(assess(home,departure,newAnchor,qa(departure,"November 4th")).score,84);
const repeated=`${qa(home)}\n\n${qa(home,"November 4th")}`;
assert.equal(validateClaim(claim(home),repeated),true);
assert.equal(assess(home,departure,repeated,qa(departure)).score,null);
const repeatedAction="Q: What happened?\nA: If I signed the form, I would have kept it.\nQ: What happened later?\nA: I signed the form.";
assert.equal(assess("I signed the form","I did not sign the form.",repeatedAction,
    qa("I did not sign the form."),{activityPhrase:"signed the form"},{activityPhrase:"did not sign the form"}).score,null);

// A plain quote can still be grounded, but needs separately supported event context.
assert.equal(validateClaim(claim(home),home),true);
assert.equal(scoreFacts(new TestimonyFact(claim(home)),new TestimonyFact(claim(departure)),{sameEvent:true}).score,84);
console.log("All source-grounding and home/departure regression tests passed.");
