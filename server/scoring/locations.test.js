import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCandidate } from "../humanConfidencePipeline.js";

const claim = (original, fields = {}) => ({original, activityPhrase:null, timePhrase:null,
    locationPhrase:null, personPhrase:null, objectPhrase:null, quantityPhrase:null,
    statePhrase:null, qualifierPhrases:[], ...fields});
const source = (person = "nathan", place = "the corner store", day = "september 11", time = "11 am") =>
    `i saw ${person} at ${place} on ${day} at ${time}`;
const first = source(), second = source("nathan", "the gym");
const score = (a = first, b = second, fields1 = {}, fields2 = {}, type = "DIRECT", t1 = a, t2 = b) =>
    assessCandidate({type, claim1:claim(a,fields1), claim2:claim(b,fields2)},t1,t2);
const locationRule = r => r.rulesFired.find(rule => rule.id === "point-location");

test("screenshot pair gains source-derived location support, independent of model fields", () => {
    const bare=score();
    assert.equal(bare.status,"CONFLICT_SUPPORTED");
    assert.equal(bare.score,77); // Current provisional settings, not a probability.
    assert.equal(locationRule(bare).verdict,"CONFLICT");
    assert.ok(bare.rulesLimiting.some(r => /Co-location/.test(r.explanation)));
    const extracted=score(first,second,{activityPhrase:"saw",personPhrase:"nathan",locationPhrase:"corner store",timePhrase:"september 11 at 11 am"},
        {activityPhrase:"saw",personPhrase:"nathan",locationPhrase:"gym",timePhrase:"11 am"});
    assert.equal(extracted.score,bare.score);
    for (const type of ["DIRECT","INFERENTIAL","FALSE_POSITIVE"]) {
        const result=score(first,second,{}, {},type);
        assert.equal(result.score,bare.score); assert.equal(result.type,type);
    }
});

test("generalizes to other names, venues, date spellings and clock formats", () => {
    for(const [a,b] of [
        [source("maya patel","the library","october 4th","2:15 pm"),source("maya patel","the hospital","october 4","14:15")],
        ["I was at the office on Monday at noon.","I was at the warehouse on Monday at 12 pm."],
        ["I saw Jordan at the school at 8 am on March 2.","I saw Jordan at the bank at 8 am on March 2nd."],
    ]) assert.equal(score(a,b).status,"CONFLICT_SUPPORTED");
});

test("same venue and exact time support compatibility", () => {
    assert.equal(score(first,first).status,"COMPATIBLE_SUPPORTED"); assert.ok(score(first,first).score <= 15);
});

test("different people, dates, times and approximate times never establish this clash", () => {
    for(const b of [source("riley","the gym"),source("nathan","the gym","september 12"),
        source("nathan","the gym","september 11","1 pm"),source("nathan","the gym","september 11","around 11 am"),
        source("nathan","the gym","september 11","11"),source("him","the gym"), "i saw nathan at the gym at 11 am"]) {
        const r=score(first,b,{activityPhrase:"saw",timePhrase:"11 am",locationPhrase:"corner store"},
            {activityPhrase:"saw",timePhrase:b.includes("11 am")?"11 am":null,locationPhrase:"gym"});
        assert.equal(r.status,"NOT_EVALUABLE",b); assert.equal(r.score,null,b);
    }
});

test("aliases, containment, nearby places and multiple venues remain unresolved", () => {
    for(const b of [source("nathan","the store"),source("nathan","the corner store inside the gym"),
        source("nathan","the gym near the corner store"),source("nathan","the gym and library")]) {
        assert.equal(score(first,b).status,"NOT_EVALUABLE",b);
    }
    assert.equal(score(source("nathan","the gym"),source("nathan","the fitness center")).status,"NOT_EVALUABLE");
});

test("source sentences stop cropped negation, hypotheticals and reported speech", () => {
    for(const prefix of ["It is not true that ","If ","Someone told me ","I did not say that "]) {
        assert.equal(score(first,second,{}, {},"DIRECT",first,prefix+second).score,null,prefix);
    }
    assert.equal(score(first,second,{locationPhrase:"airport"}).notEvaluableReason,"UNVERIFIED_SOURCE");
});

test("question dates work; question-only and repeated quotes cannot ground a score", () => {
    const a="I saw Casey at the store at 11 am.", b="I saw Casey at the gym at 11 am.";
    const t1=`Q: What happened on September 11?\nA: ${a}`, t2=`Q: What happened on September 11?\nA: ${b}`;
    assert.equal(score(a,b,{}, {},"DIRECT",t1,t2).status,"CONFLICT_SUPPORTED");
    assert.equal(score(a,b,{}, {},"DIRECT",t1,`Q: ${b}\nA: No.`).notEvaluableReason,"UNVERIFIED_SOURCE");
    assert.equal(score(a,b,{}, {},"DIRECT",t1,`${t2}\nQ: Repeat?\nA: ${b}`).score,null);
});

test("assertion uncertainty changes commitment, not the factual rule", () => {
    const hedged=score(first,`i think ${second}`);
    assert.equal(hedged.status,"CONFLICT_SUPPORTED"); assert.ok(hedged.score < score().score);
    assert.equal(hedged.evidenceStrength,score().evidenceStrength);
});


test("cropping a source hedge cannot inflate the location score", () => {
    const full=score(first,`i think ${second}`);
    const cropped=score(first,second,{}, {},"DIRECT",first,`i think ${second}`);
    assert.equal(cropped.score,full.score);
    assert.equal(cropped.commitment.pair,full.commitment.pair);
});

test("line wrapping is supported and invalid calendar dates are rejected", () => {
    assert.equal(score(first,second.replace("at the", "at\n the")).status,"CONFLICT_SUPPORTED");
    assert.equal(score(source("nathan","the store","february 30"),source("nathan","the gym","february 30")).score,null);
});
