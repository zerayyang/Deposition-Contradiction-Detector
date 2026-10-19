import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBindingMessage} from './sourceStatus.js';
test('literal witness quote with bad context is explained separately',()=>{
 const binding={status:'ANCHOR_MISMATCH',matchCount:1,eligibleCount:0,selected:null,diagnostics:[{code:'NO_GOVERNING_QUESTION',field:'sourceQuestion'}]};
 assert.match(sourceBindingMessage(binding),/quotation was found/);assert.match(sourceBindingMessage(binding),/no identified governing question/);
 assert.match(sourceBindingMessage({...binding,diagnostics:[{code:'<script>bad()</script>'}]}),/supplied question or answer anchor did not match/);assert.doesNotMatch(sourceBindingMessage({...binding,diagnostics:[{code:'<script>bad()</script>'}]}),/<script>/);
});
