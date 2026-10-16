import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { COVERAGE_TAGS, atomicJson, archiveDraft, digest, extractResponseText, readJson, sameContent, selectTemperature, validateCase, validateCases, validateGenerated } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const seeds = await readJson(path.join(here, 'seeds.json'));
const fixture = () => ({ id: 'unit-case', transcript1_text: 'Q: Was it open?\nA: Yes.', transcript2_text: 'Q: Was it open?\nA: No.', expected_type: 'DIRECT', expected_evidence: 'CONFLICT', expected_score_band: 'STRONG', tricky_feature: 'explicit negation', rationale: 'The answers affirm and deny the same proposition.', status: 'draft' });
// Synthetic schema fixtures are not expected-result proposals for source seeds or app tests.
const generatedFixture = () => Array.from({ length: 25 }, (_, i) => ({ ...fixture(), id: `unit-${i}`,
  ...(i < 5 ? { transcript2_text: 'Q: Was it open?\nA: Yes.', expected_type: 'FALSE_POSITIVE', expected_evidence: 'COMPATIBLE', expected_score_band: 'WEAK', rationale: 'The answers both affirm the same proposition.' } : {}),
  tricky_feature: i < COVERAGE_TAGS.length ? `[${COVERAGE_TAGS[i]}] synthetic validation tag` : 'synthetic schema fixture' }));
const syntheticSeeds = [{ id: 'unit-0', transcript1_text: 'Q: Was it open?\nA: Yes.', transcript2_text: 'Q: Was it open?\nA: Yes.' }];
test('temperature capability is chosen before calls without any retry', () => {
  const known = selectTemperature('claude-opus-5-5');
  assert.equal(known.temperatureMode, 'known-deprecated-provider-default');
  assert.equal(known.temperatureRequested, null);
  assert.deepEqual(known.parameters, {});
  assert.match(known.modelCapability.evidence, /Observed provider HTTP 400/);
  const other = selectTemperature('another-model');
  assert.equal(other.temperatureMode, 'explicit-zero');
  assert.deepEqual(other.parameters, { temperature: 0 });
  const explicit = selectTemperature('another-model', true);
  assert.equal(explicit.temperatureMode, 'provider-default-explicit');
  assert.deepEqual(explicit.parameters, {});
  assert.equal(selectTemperature('claude-opus-5-5', true).temperatureMode, 'provider-default-explicit');
});
test('known reasoning blocks preserve strict text while unknown blocks fail', () => {
  const envelope = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'reasoning metadata' }, { type: 'redacted_thinking', data: 'opaque' }, { type: 'text', text: '[1,' }, { type: 'text', text: '2]' }] };
  assert.equal(extractResponseText(envelope), '[1,2]');
  for (const type of ['tool_use', 'image', 'unknown']) assert.throws(() => extractResponseText({ ...envelope, content: [{ type }, { type: 'text', text: '[]' }] }), /Unexpected response block/);
  assert.throws(() => extractResponseText({ ...envelope, stop_reason: 'max_tokens' }), /stop_reason/);
  assert.throws(() => extractResponseText({ ...envelope, content: [{ type: 'thinking' }] }), /at least one text/);
});

test('generated contract enforces minimum cases, false positives, seed preservation, and all coverage tags', () => {
  validateGenerated(generatedFixture(), syntheticSeeds);
  assert.throws(() => validateGenerated(generatedFixture().slice(0, 24), syntheticSeeds), /At least 25/);
  const fewerFalse = generatedFixture(); fewerFalse[0].expected_type = 'DIRECT';
  assert.throws(() => validateGenerated(fewerFalse, syntheticSeeds), /At least five/);
  const missingTag = generatedFixture(); missingTag[0].tricky_feature = 'missing reserved tag';
  assert.throws(() => validateGenerated(missingTag, syntheticSeeds), /coverage tag/);
});
test('prior handcrafted preview is archived unchanged and fails the tightened contract', async () => {
  const preview = await readJson(path.join(here, 'archive', 'prior-handcrafted-preview.pre-interface-contract.json'));
  assert.equal(preview.length, 30);
  assert.ok(preview.every(c => c.status === 'draft'));
  assert.throws(() => validateCases(preview), /null exactly when/);
});
test('corrected source questions remain literal without added date context', () => {
  const sleep = seeds.find(c => c.id === 'sample-sleep');
  assert.equal(sleep.transcript1_text.split('\n')[0], 'Q: What time did you go to sleep?');
  assert.equal(sleep.transcript2_text.split('\n')[0], 'Q: What time did you go to sleep?');
  assert.equal(seeds.find(c => c.id === 'sample-food').transcript1_text.split('\n')[0], 'Q: Where were you on the evening of November 3rd?');
});
test('schema rejects missing fields and unknown labels without fixing them', () => {
  const missing = fixture(); delete missing.expected_evidence;
  assert.throws(() => validateCase(missing), /Missing expected_evidence/);
  assert.throws(() => validateCase({ ...fixture(), expected_type: 'direct' }), /Invalid expected_type/);
  assert.throws(() => validateCase({ ...fixture(), expected_evidence: 'UNKNOWN' }), /Invalid expected_evidence/);
  assert.throws(() => validateCase({ ...fixture(), expected_score_band: 1 }), /Invalid expected_score_band/);
  assert.throws(() => validateCase({ ...fixture(), status: 'approved' }), /Invalid status/);
  assert.throws(() => validateCase({ ...fixture(), extra: true }), /Unexpected field/);
  assert.throws(() => validateCase({ ...fixture(), id: 'has.dot' }), /id must/);
});
test('null scores mean exactly NOT_EVALUABLE and compatible cases have a real band', () => {
  assert.equal(validateCase({ ...fixture(), expected_evidence: 'NOT_EVALUABLE', expected_score_band: null }).expected_score_band, null);
  assert.throws(() => validateCase({ ...fixture(), expected_score_band: null }), /null exactly when/);
  assert.throws(() => validateCase({ ...fixture(), expected_evidence: 'NOT_EVALUABLE', expected_score_band: 'LIMITED' }), /null exactly when/);
  assert.throws(() => validateCase({ ...fixture(), expected_evidence: 'COMPATIBLE', expected_score_band: null }), /null exactly when/);
  assert.equal(validateCase({ ...fixture(), expected_evidence: 'COMPATIBLE', expected_score_band: 'WEAK' }).expected_score_band, 'WEAK');
  assert.throws(() => validateCase({ ...fixture(), rationale: 'First.\nSecond.' }), /single sentence/);
});
test('duplicate IDs and modified seed text are rejected', () => {
  assert.throws(() => validateCases([fixture(), fixture()]), /Duplicate ID/);
  const copy = generatedFixture();
  copy[0].transcript1_text += ' added';
  assert.throws(() => validateGenerated(copy, syntheticSeeds), /changed source seed/);
});
test('JSON fences and trailing commas are not accepted by strict parsing', () => {
  assert.throws(() => JSON.parse('```json\n[]\n```'));
  assert.throws(() => JSON.parse('[{},]'));
});
test('review equality detects differences in labels, rationale, and source text', () => {
  const a = fixture();
  assert.ok(sameContent(a, { ...a, status: 'approved', human_review: {} }));
  for (const [key, value] of [['expected_type', 'INFERENTIAL'], ['rationale', 'A different judgment.'], ['transcript1_text', 'Changed input']]) {
    assert.equal(sameContent(a, { ...a, [key]: value }), false);
    assert.notEqual(digest(a), digest({ ...a, [key]: value }));
  }
});
test('atomic replacement and archival retain a recoverable old draft', async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'deposition-author-unit-'));
  const file = path.join(dir, 'draft.json');
  try {
    await atomicJson(file, [fixture()]);
    const archive = await archiveDraft(file, path.join(dir, 'archive'));
    await atomicJson(file, []);
    assert.deepEqual(await readJson(file), []);
    assert.deepEqual(await readJson(archive), [fixture()]);
  } finally { await fs.rm(dir, { recursive: true }); }
});
test('approval refuses noninteractive automatic input before accessing gold', () => {
  const run = spawnSync(process.execPath, [path.join(here, 'approve.mjs')], { input: 'a\na\n', encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /interactive terminal/);
});
