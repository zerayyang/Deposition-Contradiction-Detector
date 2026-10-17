import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCaseStore, createLocalDocumentStore, localModeEnabled, isLocalHost, LOCAL_SESSION } from './localStores.js';
import { createAuthentication } from '../../server/authentication.js';

// In-memory stand-in for IndexedDB; fictional values only.
const memoryKv = () => { const m = new Map(); return { m, get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }, keys: async p => [...m.keys()].filter(k => k.startsWith(p)) }; };

test('no-account mode turns on only for localhost without Supabase', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'LOCALHOST']) assert.equal(localModeEnabled({ supabaseConfigured: false, hostname: host }), true, host);
  for (const host of ['deposition.vercel.app', 'example.com', '192.168.1.5', 'localhost.evil.com', '', undefined]) assert.equal(localModeEnabled({ supabaseConfigured: false, hostname: host }), false, String(host));
  assert.equal(localModeEnabled({ supabaseConfigured: true, hostname: 'localhost' }), false);
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(LOCAL_SESSION.local, true);
});

test('local cases can be created, listed newest first, saved, reopened and deleted', async () => {
  const kv = memoryKv(); let n = 0; const times = ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'];
  const store = createLocalCaseStore(kv, { randomId: () => `case-${n}`, now: () => times[n++] });
  const a = await store.create('First'), b = await store.create(' Second ');
  assert.equal(b.title, 'Second');
  assert.deepEqual((await store.list()).map(r => r.title), ['Second', 'First']);
  await store.save(a.id, { texts: ['Q: A?\nA: Yes.', 'Q: B?\nA: No.'], results: [{ type: 'DIRECT' }], seconds: 3, analysis: { status: 'complete' }, notes: 'n', reviewed: true, files: [{ path: 'p', name: 'x.pdf', size: 1, type: 'application/pdf' }, null] });
  const row = await store.get(a.id);
  assert.equal(row.transcript1, 'Q: A?\nA: Yes.'); assert.deepEqual(row.results, { findings: [{ type: 'DIRECT' }], elapsedSeconds: 3, analysis: { status: 'complete' } });
  assert.equal(row.review_notes.documents[0].name, 'x.pdf'); assert.equal(row.review_notes.documents[1], null);
  await store.remove(a.id); await assert.rejects(store.get(a.id), /not found/);
  await assert.rejects(store.remove('sample'), /Select a saved case/);
  await assert.rejects(store.create('   '), /between 1 and 200/);
});

test('local originals are stored, returned byte-for-byte and removed per case', async () => {
  const kv = memoryKv(); let n = 0; const docs = createLocalDocumentStore(kv, () => `f${n++}`);
  const file = new File(['%PDF fictional'], 'first.pdf', { type: 'application/pdf' });
  const meta = await docs.upload('case-1', file);
  assert.match(meta.path, /^local-development\/case-1\/f0\.pdf$/); assert.equal(meta.type, 'application/pdf');
  assert.equal(await (await docs.download('case-1', meta)).text(), '%PDF fictional');
  await assert.rejects(docs.download('case-2', meta), /does not belong/);
  await assert.rejects(docs.upload('case-1', new File(['x'], 'notes.docx')), /Choose a \.pdf/);
  await assert.rejects(docs.upload('sample', file), /Save this case/);
  await docs.upload('case-1', new File(['b'], 'second.txt'));
  await docs.removeCaseFiles('case-1'); assert.equal((await kv.keys('file:')).length, 0);
});

test('without Supabase the server accepts unsigned requests only from this computer', async () => {
  const authenticate = createAuthentication({ allowLocal: true });
  assert.deepEqual(await authenticate({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), { id: 'local-development' });
  await assert.rejects(authenticate({ socket: { remoteAddress: '203.0.113.7' }, headers: {} }), /Local access only/);
  assert.throws(() => createAuthentication({ allowLocal: false }), /Configure SUPABASE_URL/);
});
