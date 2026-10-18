import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewReport} from './reviewReport.js';

// Fictional findings. A finished review whose only issue is an unscored finding is reported as
// complete with the reason; a real failure still reads as an incomplete review.
const finding={type:'INFERENTIAL',reasoning:'Fictional.',claim1:{original:'About ten.'},claim2:{original:'Forty.'},status:'NOT_EVALUABLE',score:null};
const unscored={reason:'A returned quote/extraction failed source validation; retained unscored for review.'};
test('printed report: all compared, some unscored, is not called incomplete',()=>{
 const html=buildReviewReport({draft:{results:[finding],analysis:{status:'partial',tasks:[{id:'0:0',status:'completed'}],issues:[unscored]}}});
 assert.doesNotMatch(html,/INCOMPLETE REVIEW/);assert.match(html,/All planned comparisons completed\. 1 finding is shown without a confidence score/);
 assert.match(html,/Status: complete · 1 unscored/);
});
test('printed report: a failed section is still an incomplete review',()=>{
 const html=buildReviewReport({draft:{results:[finding],analysis:{status:'partial',tasks:[{id:'0:0',status:'completed'},{id:'0:1',status:'failed'}],issues:[unscored]}}});
 assert.match(html,/INCOMPLETE REVIEW/);
});
