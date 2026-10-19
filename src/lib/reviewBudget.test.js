import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBudgetOptions,withSuggestedReviewBudget,selectedReviewBudget} from './reviewBudget.js';

const plan = (extra={}) => ({execution:'durable-steps',cost:{conservativeBudget:.988328},serverBudgetLimitUsd:25,...extra});
test('new review defaults to the conservative suggestion rounded up to cents',()=>{
  const original=plan({approvedBudgetUsd:.988328});
  assert.equal(withSuggestedReviewBudget(original).approvedBudgetUsd,.99);
  assert.equal(original.approvedBudgetUsd,.988328);
  assert.equal(withSuggestedReviewBudget(plan({cost:{conservativeBudget:2.99}})).approvedBudgetUsd,2.99);
});
test('choices offer a lower cap and extra room without exceeding server ceiling',()=>{
  assert.deepEqual(reviewBudgetOptions(plan()),{suggested:.99,lower:.74,extra:1.49,capped:false});
  assert.deepEqual(reviewBudgetOptions(plan({serverBudgetLimitUsd:.8})),{suggested:.8,lower:.6,extra:.8,capped:true});
  assert.equal(reviewBudgetOptions(plan({cost:{conservativeBudget:.001}})).lower,.01);
});
test('resume preserves the exact saved remaining cap and fixed plan identity',()=>{
  const saved=plan({budgetFixed:true,approvedBudgetUsd:.317239});
  assert.equal(withSuggestedReviewBudget(saved),saved);
  assert.equal(selectedReviewBudget(saved),.317239);
});
test('selected analysis cap drives the combined approval display and leaves confidence separate',()=>{
  const selected=withSuggestedReviewBudget(plan());
  assert.equal(selectedReviewBudget(selected)+2,2.99);
  assert.equal(selectedReviewBudget({...selected,approvedBudgetUsd:.74})+2,2.74);
  const local=plan({execution:'local'});
  assert.equal(withSuggestedReviewBudget(local),local);
  assert.equal(selectedReviewBudget(local),.988328);
});
