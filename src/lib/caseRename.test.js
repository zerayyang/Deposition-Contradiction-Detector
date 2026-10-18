import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCaseStore } from './localStores.js';
import { createCaseStore } from './caseStore.js';
import { testimonyMarkers } from '../../server/testimonyMarkers.js';

// Fictional values only.
const memoryKv = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }, keys: async p => [...m.keys()].filter(k => k.startsWith(p)) }; };
test('a local case can be renamed and keeps its contents', async () => {
  const store = createLocalCaseStore(memoryKv(), { randomId: () => 'case-1', now: () => '2026-01-01T00:00:00Z' });
  await store.create('Old name');
  assert.equal((await store.rename('case-1', '  New name ')).title, 'New name');
  assert.equal((await store.list())[0].title, 'New name');
  await assert.rejects(() => store.rename('case-1', '   '));
  await assert.rejects(() => store.rename('sample', 'X'));
});
test('the signed-in store renames by updating only the title', async () => {
  let sent;
  const client = { from: () => ({ update: payload => { sent = payload; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'c1', title: payload.title }, error: null }) }) }) }; } }) };
  assert.equal((await createCaseStore(client).rename('c1', 'Renamed')).title, 'Renamed');
  assert.deepEqual(sent, { title: 'Renamed' });
});
test('real transcript formats are recognised without asking who is speaking', () => {
  const has = text => testimonyMarkers(text).some(m => m.role === 'A' || m.role === 'Q');
  assert.ok(has('Q: Where were you?\nA: At home.'));
  assert.ok(has('2 Q Where were you?\n3 A At home, I think.'), 'line-numbered trial format');
  assert.ok(!has('This memo summarizes the facts of the case.'), 'plain prose has no structure');
});
