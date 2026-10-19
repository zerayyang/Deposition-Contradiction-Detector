import test from 'node:test';
import assert from 'node:assert/strict';
import {locateQuote} from './quoteLocation.js';

// Fictional testimony only.
const text='Q. Where were you?\nA. I was at the office\nall evening. I left at nine.\nQ. Then?\nA. I was at the office all evening.';

test('uses saved offsets only when the text there is the quote',()=>{
  const start=text.lastIndexOf('I was at the office all evening.');
  assert.deepEqual(locateQuote(text,'I was at the office all evening.',[{start,end:start+32}]),{start,end:start+32});
  assert.deepEqual(locateQuote(text,'I left at nine.',[{start:0,end:5}]),{start:text.indexOf('I left'),end:text.indexOf('I left')+15},'wrong offsets are ignored');
});
test('finds a quote across line breaks and curly quotes, and gives up honestly',()=>{
  const r=locateQuote(text,'I was at the office all evening. I left',[]);
  assert.equal(text.slice(r.start,r.end),'I was at the office\nall evening. I left');
  assert.ok(locateQuote('A. He said “yes” then.','He said "yes" then.'));
  assert.equal(locateQuote(text,'never said this',[]),null);
  assert.equal(locateQuote('','anything'),null);
});
