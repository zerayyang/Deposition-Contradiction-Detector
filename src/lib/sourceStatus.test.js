import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBindingMessage} from './sourceStatus.js';
import {buildReviewReport} from './reviewReport.js';
test('literal witness quote with bad context is explained separately and escaped in reports',()=>{
 const binding={status:'ANCHOR_MISMATCH',matchCount:1,eligibleCount:0,selected:null,diagnostics:[{code:'NO_GOVERNING_QUESTION',field:'sourceQuestion'}]};
 assert.match(sourceBindingMessage(binding),/quotation was found/);assert.match(sourceBindingMessage(binding),/no identified governing question/);
 const html=buildReviewReport({draft:{results:[{type:'DIRECT',status:'NOT_EVALUABLE',score:null,sourceBindings:{claim2:binding},claim1:{original:'I signed.'},claim2:{original:'I did not sign.'}}]}});
 assert.match(html,/quotation was found in witness speech/);assert.match(html,/No numeric score/);
 assert.match(sourceBindingMessage({...binding,diagnostics:[{code:'<script>bad()</script>'}]}),/supplied question or answer anchor did not match/);assert.doesNotMatch(sourceBindingMessage({...binding,diagnostics:[{code:'<script>bad()</script>'}]}),/<script>/);
});
