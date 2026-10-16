# Part 4: event matching and classification

This is an isolated comparison engine for Part 3's extracted event records. It does
not switch the active website/API to the new pipeline, modify saved cases, or call
numeric scoring. App/recovery/UI integration is Part 5. Feedback/memory stages are
still separate. No live model call is made on import or during local checks.

## Trusted caller interface

```js
import {
  buildEventComparisonPlan, previewEventComparisonPlan, executeEventComparison
} from './compare.js';
const plan = buildEventComparisonPlan({extractionPlan, extractionResult}, {
  sameWitnessConfirmed: false // Review/establish identity; never infer it from names.
});
const preview = previewEventComparisonPlan(plan); // No network/model calls.
// Present this new phase's request count and budget; extraction approval alone
// does not authorize comparison spending. Obtain an explicit reviewed decision.
const result = await executeEventComparison({
  plan, approval: reviewedApproval, callModel, signal, onEvent
});
```

Supply exactly two original source documents through their Part 3 extraction plan,
plus the matching extraction result. Plan ID, original text hashes, page maps/OCR,
record shape, exact quotations, roles and question bindings are freshly checked.
Do not trust a client's assertion that `recordValidation.valid` is true. Only use
server-held extraction artifacts with trusted provenance, not arbitrary client
objects. Local record validation does not prove that an extraction actually ran or
that its proposed meanings are correct. Part 5 must supply authenticated private
artifact storage and durable build/job identity.

Source coverage must account for every original character. Incomplete extraction
blocks comparison by default. `allowPartialExtraction:true` is an explicit review
mode for available records; copied upstream gaps/failures stay visible and even a
fully processed comparison phase cannot return COMPLETE for that incomplete input.
The caller's `sameWitnessConfirmed` is an assertion, not an independently verified
identity. Its default false leaves review flags on every assessed comparison. A
model cannot set it or turn a name match into verified identity.

The execution approval requires exact planId/requestCount and finite maxUsd at least
the displayed conservative budget. Only an immutable plan built in this process is
accepted; after restart rebuild and review. Do not auto-fill approval on behalf of
the user. Model adapters must also disable their own retries. No credentials or
SDK client are created here. Original model policy and provider interface are reused.

## Global matching without vocabulary/position filters

Every primary event block in document 1 crosses every primary event block in
document 2. The engine never excludes a pair based on event kind, attribute names,
word overlap, a disputed date/location or section ordering. It has no one-to-one
matching constraint. The model matches and classifies within each assigned block
request; there is no later reviewer assumed to recover a relationship declared
unrelated or missed upstream by extraction.

The input includes source-verified proposed event records, full witness answers,
governing questions and the existing bounded working question history. Shared
source context is sent once per block. Explicit correction/qualification links are
followed both forward and backward, including across distant primary blocks; linked
records are context rather than extra primary cells. Earlier statements and linked
corrections are retained, never deleted or automatically treated as a contradiction.
An unresolved link remains unresolved. The model must apply the actual words and
scope; code does not decide event identity from its kind string or declared polarity.

Original classification instructions before `## 6. Required Output` in
`../proper_prompts.md` are included verbatim, including DIRECT, INFERENTIAL,
FALSE_POSITIVE, scope, hedges, uncertainty, reporting and consolidation rules. The
new COMPARISON_PROMPT.md changes the transport/accounting interface, not those
classification definitions. Instructions, source inputs and the new schema are
fingerprinted; the comparison module and relevant helpers also have a code digest.
This is local workflow provenance, not proof of which deployed backend build ran.

## Explicit pair dispositions and strict sources

Each left event needs one row. Every right event position must appear exactly once
in a related/unresolved pair or an unrelated range [start,end). Unrelated ranges
compress negative results without silently ignoring cells; their reason and actual
right IDs remain in the audit. Missing rows/cells, duplicate/conflicting dispositions,
invalid intervals and unknown IDs are visible issues and prevent COMPLETE. Accounted
means a disposition exists, not that a semantic relationship has been proved.

A RELATED pair needs assessed issues; multiple independent issues per pair are
supported. UNRESOLVED retains missing context without a fabricated type. Each
assessed issue uses only the existing three types, reasoning, report boolean,
source IDs and missing-context descriptions. Compatible/identical audit comparisons
can be FALSE_POSITIVE with report:false under the existing independent-card rules.
Suppressing a standalone card therefore does not erase the assessed comparison.

Code derives quotations, offsets, roles and page refs from the cited event sources;
the model supplies none of those values. Each assessment must cite a primary witness
source on both sides. Governing questions/correction records may supply additional
context but cannot replace witness evidence. Forged/wrong-side/question-only citations,
extra score/evidence-status fields or new type names fail strict validation. Valid
independent siblings are retained when another assessment fails. Original JSON,
rejections, reasons and assignment IDs are kept for review; nothing is repaired or
relabeled to make it pass. Source validation still does not prove the reasoning or
the model's classification, and no confidence calculation is invoked.

## Conservative deduplication

Only fully equivalent event records, disregarding local IDs and their rewritten
source references, group together. All original members remain. Different summaries,
interpretations, source occurrences, scopes or links remain separate. No fuzzy
semantic merging or automatic alias learning is used. Exact repeated assessments
within the same event pair/type/issue/source tuple combine while preserving every
variant. Different types remain separate and disagreements are flagged. Different
standalone-card decisions remain visible and flagged. Shared quotes alone never
merge different event interpretations or independent factual issues.

## Results and limits

Results expose status, all audit comparisons, reportable findings, source catalogs,
per-task raw responses/dispositions/rejections, original page references and coverage.
COMPLETE means all assigned processing succeeded on complete upstream extraction;
PARTIAL, FAILED and CANCELLED retain available results. Empty extracted event lists
produce zero possible pairs, not evidence that a deposition is contradiction-free.
No numeric confidence/evidence score is generated. Unsupported scores remain the
responsibility of unchanged deterministic scoring when Part 5 supplies validated facts.

Cancellation/timeouts stop hung transports. Failed calls do not retry; other planned
blocks can finish unless cancelled. Awaited checkpoint callback failures stop later
requests and include error.comparisonResult. Callback snapshots are copied. This is
in-memory orchestration: durable persistence/resume/UI remain Part 5 responsibilities.

Defaults: 64 primary events per block, a 128,000 UTF-8-byte packing target per side,
128 requests, one million unique event pairs, 32,000 output tokens including thinking,
and 120 seconds per call. A single large record keeps its full context even beyond
the packing target; final model context-budget validation either accepts it or stops
planning. Nothing is shortened. Dense related blocks can exceed output capacity and
fail visibly; smaller blocks/output-budget choices need a newly reviewed plan.

The input/output cost preview is a local UTF-8 estimate at existing configured model
rates, not provider tokenization or guaranteed billing. Token usage per returned call
is retained. Missing usage and unpriced cache usage leave aggregate costs unknown.
These provider API estimates are separate from Codex credits.

All-to-all event coverage can be expensive for large extractions. Caps stop the plan
before any spending and do not keep only a top-k subset. Increasing a cap requires
an explicit caller configuration and newly approved preview. A future cheaper/indexed
matcher must demonstrate candidate recall before replacing this coverage baseline.
The current engine guarantees assignment accounting, **not** that the model notices
all relationships or that the extractor found every event. Live quality, latency and
cost have not been evaluated in Part 4.

## Local testing and isolation

Run `npm run tests:events`. Part 4 uses only fictional sources and mock responses,
including two 225-page manifests, 50,625 assigned pairs and a distant page-225/page-1
match. Existing full-document regression checks separately exercise actual synthetic
PDF extraction. Intended outcomes are in ../../tests/events/EXPECTED_RESULTS.md.
Model categories in these tests are scripted transport inputs, not approved human
labels or measured classification accuracy. No private testimony, gold, author drafts
or verifier reports are consulted. Raw runtime results can contain sensitive text;
keep them in private authenticated storage, not public logs or learned memory.
