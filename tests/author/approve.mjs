import { reviewSources } from './level2.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { atomicJson, digest, exists, readJson, sameContent, validateCase, validateCases } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const draftPath = path.join(here, '..', 'gold.draft.json');
const goldPath = path.join(here, '..', 'gold.json');
const argv = process.argv.slice(2);
let ids = null;
let reviewer = os.userInfo().username;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--ids' && argv[i + 1]) ids = argv[++i].split(',');
  else if (argv[i] === '--reviewer' && argv[i + 1]) reviewer = argv[++i];
  else throw new Error('Usage: node tests/author/approve.mjs [--ids id,id] [--reviewer name]');
}
if (!reviewer.trim() || (ids && (ids.some(id => !id) || new Set(ids).size !== ids.length))) throw new Error('Invalid reviewer or IDs');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Human approval requires an interactive terminal; piped automatic approval is refused');

const drafts = validateCases(await readJson(draftPath), { statuses: ['draft', 'approved', 'rejected'], allowReview: true });
let gold = await exists(goldPath) ? validateCases(await readJson(goldPath), { statuses: ['approved'], allowReview: true }) : [];
for (const c of gold) if (c.human_review?.explicit_human_review !== true && c.human_review?.explicit_human_approval !== true) throw new Error(`Existing gold ${c.id} lacks explicit human-review provenance; refusing to rewrite gold`);
if (ids) for (const id of ids) if (!drafts.some(c => c.id === id)) throw new Error(`Unknown draft ID ${id}`);
// Detect other processes changing either file during review instead of overwriting their work.
let draftSnapshot = await fs.readFile(draftPath, 'utf8');
let goldSnapshot = await exists(goldPath) ? await fs.readFile(goldPath, 'utf8') : null;
async function checkUnchanged() {
  const currentGold = await exists(goldPath) ? await fs.readFile(goldPath, 'utf8') : null;
  if (await fs.readFile(draftPath, 'utf8') !== draftSnapshot || currentGold !== goldSnapshot) throw new Error('Draft or gold changed during review; restart to review the current files');
}
async function saveDrafts() { await atomicJson(draftPath, drafts); draftSnapshot = await fs.readFile(draftPath, 'utf8'); }
const reviewDir = path.join(here, 'reviews');
await fs.mkdir(reviewDir, { recursive: true });
async function logDecision(decision, c, extra = {}) {
  const event = { decision, reviewer, at: new Date().toISOString(), explicit_human_review: true, case: c, content_sha256: digest(c), ...extra };
  const file = path.join(reviewDir, `${Date.now()}-${crypto.randomUUID()}.json`);
  await atomicJson(file, event);
  return file;
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
try {
  let quit = false;
  for (let i = 0; i < drafts.length && !quit; i++) {
    let c = drafts[i];
    if (ids && !ids.includes(c.id)) continue;
    if (c.status !== 'draft') { console.log(`Skipping ${c.id}: ${c.status}`); continue; }
    while (c.status === 'draft') {
      if (c.source_refs) console.log('Level 2 source/reference review (reference is NOT detector input):\n' + JSON.stringify(await reviewSources(c), null, 2));
      console.log('\nReview the complete case (all labels are suggestions):\n' + JSON.stringify(c, null, 2));
      const existing = gold.find(g => g.id === c.id);
      const divergent = existing && !sameContent(existing, c);
      if (divergent) console.log('ID COLLISION: approved gold has different content. Edit this draft to a distinct ID or to identical reviewed content before approving. Existing gold:\n' + JSON.stringify(existing, null, 2));
      const choice = (await rl.question('[a] approve, [e] edit, [r] reject, [q] quit: ')).trim().toLowerCase();
      if (choice === 'q') { quit = true; break; }
      if (choice === 'e' && c.source_refs) { console.log('Level 2 edits require a new source-validated proposal and unique ID; reject this draft or quit. Source passages cannot be silently edited.'); continue; }
      if (choice === 'e') {
        const line = await rl.question('Paste the complete edited draft object as strict single-line JSON (blank cancels): ');
        if (!line.trim()) continue;
        let edited;
        try {
          edited = validateCase(JSON.parse(line));
          if (drafts.some((d, j) => j !== i && d.id === edited.id)) throw new Error(`Draft ID ${edited.id} already exists`);
        } catch (e) { console.error(`Edit not applied: ${e.message}`); continue; }
        await checkUnchanged();
        await logDecision('edit', edited, { previous_case: c });
        drafts[i] = edited; c = edited;
        await saveDrafts();
        continue;
      }
      if (choice !== 'a' && choice !== 'r') { console.log('Enter a, e, r, or q.'); continue; }
      if (choice === 'a' && divergent) { console.log('Approval refused: edit the duplicate ID/content explicitly first.'); continue; }
      await checkUnchanged();
      if (choice === 'a' && c.source_refs) await reviewSources(c);
      if (choice === 'r') {
        await logDecision('reject', c);
        c.status = 'rejected';
        await saveDrafts();
        console.log(`Rejected and retained ${c.id}; gold is unchanged.`);
      } else {
        const review = { explicit_human_review: true, method: 'interactive-readline', reviewer,
          reviewed_at: new Date().toISOString(), content_sha256: digest(c), decision: 'approve' };
        const approved = { ...c, status: 'approved', human_review: review };
        const intent = await logDecision('approve-intent', approved);
        // Never replace divergent existing content, nor overwrite an earlier review of identical gold.
        if (!existing) {
          const nextGold = [...gold, approved];
          await atomicJson(goldPath, nextGold);
          gold = nextGold;
          goldSnapshot = await fs.readFile(goldPath, 'utf8');
        }
        drafts[i] = approved; c = approved;
        await saveDrafts();
        await logDecision('approve-complete', approved, { intent });
        console.log(`Human-approved ${c.id}; copied to gold${existing ? ' (identical existing entry retained)' : ''}.`);
      }
    }
  }
} finally { rl.close(); }
console.log(`Review ended. Pending drafts remain draft. Gold: ${goldPath}`);
