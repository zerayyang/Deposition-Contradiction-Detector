import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, archiveDraft, exists, extractResponseText, readJson, selectTemperature, validateGenerated } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const draftPath = path.join(here, '..', 'gold.draft.json');
const args = process.argv.slice(2);
let replace = false, providerDefaultTemperature = false, resumeRun = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--replace') replace = true;
  else if (args[i] === '--provider-default-temperature') providerDefaultTemperature = true;
  else if (args[i] === '--resume-run' && args[i + 1] && !args[i + 1].startsWith('--')) resumeRun = args[++i];
  else throw new Error('Usage: node tests/author/author.mjs [--replace] [--provider-default-temperature | --resume-run <stamp-or-directory>]');
}
if (resumeRun && providerDefaultTemperature) throw new Error('Resume uses recorded request parameters; do not pass --provider-default-temperature');
let temperatureMode = providerDefaultTemperature ? 'provider-default-explicit' : 'explicit-zero';
let temperatureRequested = providerDefaultTemperature ? null : 0;
const stamp = `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`;
const runDir = path.join(here, 'runs', stamp);
await fs.mkdir(runDir, { recursive: true });
let phase = 'initialization';
try {
  if (await exists(draftPath) && !replace) throw new Error('Draft already exists; inspect it and explicitly pass --replace to archive and replace it');
  const seeds = await readJson(path.join(here, 'seeds.json'));
  let result, rawText, request, sourceRun = null;
  if (resumeRun) {
    phase = 'resume-path-validation';
    const runsRoot = path.join(here, 'runs');
    const candidate = path.basename(resumeRun) === resumeRun ? path.join(runsRoot, resumeRun) : path.resolve(resumeRun);
    const inside = p => p.startsWith(runsRoot + path.sep);
    if (!inside(candidate)) throw new Error('Resume directory must be inside the author runs directory');
    sourceRun = await fs.realpath(candidate);
    if (!inside(sourceRun) || sourceRun === runDir) throw new Error('Resume directory must resolve inside the author runs directory');
    phase = 'resume-read';
    request = await readJson(path.join(sourceRun, 'request.json'));
    temperatureMode = request.temperatureMode ?? 'unrecorded';
    temperatureRequested = request.temperatureRequested ?? request.temperature ?? null;
    await atomicJson(path.join(runDir, 'resume-source.json'), { sourceRun, originalRequestPath: path.join(sourceRun, 'request.json'), request });
    result = await readJson(path.join(sourceRun, 'raw-response.json'));
    rawText = await fs.readFile(path.join(sourceRun, 'raw-text.txt'), 'utf8');
    console.log(`Explicit resume: validating preserved response from ${sourceRun}; no API request. Recorded temperature mode: ${temperatureMode}.`);
  } else {
    const prompt = await fs.readFile(path.join(here, 'AUTHOR_PROMPT.md'), 'utf8');
    await import('dotenv/config');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const model = process.env.TEST_AUTHOR_MODEL || 'claude-opus-5-5';
    const selection = selectTemperature(model, providerDefaultTemperature);
    temperatureMode = selection.temperatureMode;
    temperatureRequested = selection.temperatureRequested;
    const apiParameters = { model, ...selection.parameters, max_tokens: 16000 };
    request = { model, temperatureRequested, temperatureMode, reason: selection.reason,
      modelCapability: selection.modelCapability, apiParameters, max_tokens: 16000, system: prompt, seeds };
    await atomicJson(path.join(runDir, 'request.json'), request);
    console.log(temperatureMode === 'known-deprecated-provider-default'
      ? `Known model capability for ${model}: omitting deprecated temperature BEFORE the call after observed HTTP 400; provider-default temperature applies, not zero. No automatic retry.`
      : temperatureMode === 'provider-default-explicit'
        ? 'Explicit provider-default temperature mode: omitting temperature; this is not a temperature-zero request. No automatic retry.'
        : 'Requesting explicit temperature: 0; no automatic parameter fallback.');
    phase = 'api';
    const client = new Anthropic({ maxRetries: 0 });
    result = await client.messages.create({ ...apiParameters, system: prompt,
      messages: [{ role: 'user', content: 'Author the draft cases using these unchanged source inputs:\n' + JSON.stringify(seeds, null, 2) }] });
    phase = 'raw-result';
    await atomicJson(path.join(runDir, 'raw-response.json'), result);
    rawText = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    await fs.writeFile(path.join(runDir, 'raw-text.txt'), rawText, { flag: 'wx' });
  }
  const contentTypes = Array.isArray(result.content) ? result.content.map(b => b.type) : [];
  await atomicJson(path.join(runDir, 'content-metadata.json'), { sourceRun, contentTypes, stop_reason: result.stop_reason });
  phase = 'strict-json-validation';
  if (extractResponseText(result) !== rawText) throw new Error('Preserved raw-text.txt differs from exact text blocks in raw-response.json');
  const cases = validateGenerated(JSON.parse(rawText), seeds);
  phase = 'save';
  if (await exists(draftPath)) {
    if (!replace) throw new Error('Draft appeared during API call; refusing replacement');
    const archive = await archiveDraft(draftPath, path.join(here, 'archive'));
    await atomicJson(path.join(runDir, 'previous-draft.json'), { archive });
  }
  await atomicJson(draftPath, cases);
  await atomicJson(path.join(runDir, 'result.json'), { status: 'draft-written', cases: cases.length, draftPath,
    resumed_from: sourceRun, sourceRawResponse: path.join(sourceRun || runDir, 'raw-response.json'), contentTypes,
    originalRequestPath: path.join(sourceRun || runDir, 'request.json'),
    requestMetadata: { model: request.model, temperatureMode, temperatureRequested, reason: request.reason ?? null,
      modelCapability: request.modelCapability ?? null, apiParameters: request.apiParameters ?? null } });
  console.log(`Saved ${cases.length} unapproved draft suggestions to ${draftPath}. Raw response: ${runDir}`);
} catch (error) {
  const record = { phase, name: error.name, message: error.message, status: error.status ?? null,
    temperatureMode, temperatureRequested, resumeRun,
    unsupported: /temperature/i.test(String(error.message)) && /unsupported|not supported|not allow|deprecated|only.*1|must.*1/i.test(String(error.message)),
    error: error.error ?? null, stack: error.stack ?? null };
  await atomicJson(path.join(runDir, 'error.json'), record);
  console.error(`Author failed during ${phase}: ${error.message}. Preserved diagnostics: ${runDir}`);
  process.exitCode = 1;
}
