# Part 3: independent source-linked event extraction

This module implements the extraction engine for the staged redesign. It is not
connected to the existing analysis button, API route, job store or deployed site.
Existing comparison prompts, category definitions and numeric scoring formulas are
unchanged. Event matching is Part 4; UI/recovery integration is Part 5. No memory,
feedback learning, automatic approvals or database migrations are included.

## API for a trusted application caller

```js
import {
  buildEventExtractionPlan, previewEventExtractionPlan, executeEventExtraction
} from './extract.js';

const plan = buildEventExtractionPlan([
  {documentId: 'document-one', text: originalText, extraction, speakerRoles},
  {documentId: 'document-two', text: otherOriginalText}
]);
const preview = previewEventExtractionPlan(plan); // Makes no model calls.
// Present preview.requestCount, preview.cost and model before authorization.
// Only after an explicit reviewed decision, supply that decision's values:
const result = await executeEventExtraction({
  plan, approval: reviewedApproval, callModel, signal, onEvent
});
```

Input is one or two complete source documents. `extraction` is the existing PDF
extraction manifest when available, not a second text copy. `speakerRoles` is the
trusted Part 2 mapping, never model output. Plain input gets no fabricated pages or
speaker identity. The existing page/hash/OCR validators run before planning; OCR
pages, stale text/page maps, unknown named speakers and documents without supported
nonempty witness speech block planning. Oversize text/questions/contexts and request
caps fail explicitly; nothing is shortened or silently skipped.

`reviewedApproval` must contain `planId`, exact `requestCount`, and finite `maxUsd`
at least as large as the displayed conservative budget. The plan is immutable;
execution accepts only a plan built in this process. After restart, rebuild from
the same private original sources and compare the resulting preview/ID before reuse.
Do not treat a client's submitted plan object or an automatically populated approval
as human authorization. There is no HTTP route that invokes this engine yet.

The transport receives the existing SDK-style `model`, `max_tokens`, `system`,
`messages` parameters and `{signal,maxRetries:0}`. A trusted adapter must disable
its own retries as well. No SDK client, credentials or network request is created
on import. Execution is sequential, timeout/cancellation bounded and request capped.
The existing model policy is reused; this change does not select a cheaper model.

## Source-aware requests

The current lossless document sectioner supplies disjoint core ranges plus local
overlap. For each request the Part 2 index supplies literal witness/question units,
original offsets, caller-derived roles and governing-question IDs. Full governing
questions are included for continued answers, even when outside the raw section.
Every original core character belongs to exactly one task. Known non-witness-only
core ranges are processed locally and explicitly recorded; they make no model call.
Unknown named speech is blocked pending source review, not silently treated as such
a local exclusion. The raw section is supplied as context, not instruction authority.

Every assigned witness fragment needs exactly one explicit model disposition:
EVENTS with IDs, NO_EVENT with a reason, or UNRESOLVED with a reason. Missing,
duplicate, unsupported or unresolved dispositions make the task partial. A declared
NO_EVENT is an auditable model judgment, **not** proof that no event was missed.
Continued fragments still need dispositions; there is no cross-document matching or
cross-section reasoning pass in Part 3. The later comparison stage must consider
all related extracted events across both documents, not just corresponding sections.

## Strict transport and deterministic source materialization

`extractionProtocol.js` reuses the Part 1 event shape with a source transport shape:
`{id,unitId,quote,occurrence}`. `occurrence:null` is allowed only for a unique exact
quote in that unit. Repeated passages require an explicit zero-based occurrence.
The code resolves literal offsets, derives roles from the supplied units and maps
all overlapped original PDF pages. It namespaces local event/source IDs and remaps
only their references. This is deterministic transport encoding, not changing the
model's proposed facts. IDs are local to a plan; any future persistent storage
must key them with planId and documentId to avoid cross-run overwrites. Unknown aliases, missing facts, polarity and qualifier scope
are never filled in by code.

Source validation checks exact witness passages, governing questions, literal
attributes/qualifiers, references and schema. The record-only validator reuses
Part 1 checks but makes no processing-coverage claim. Meanings, witness identity
asserted by caller metadata, pronoun reference, event recall and legal correctness
remain proposed and need evaluation. No type label or numeric confidence can be
added by this wire contract; scoring attributes are rejected. There is no scoring
call in this module.

Bad records are quarantined, along with dependent correction links. Original JSON,
raw text, source-resolution audits, rejected proposals and reasons remain in task
results. Valid records from the same response remain available. Fields/quotes are
not repaired, coerced, paraphrased or silently dropped. Invalid envelopes, malformed
JSON, fenced JSON and non-end_turn/truncated responses fail visibly without retries.
The shared literal lookup now enumerates overlapping quote occurrences, fixing a
locally reproduced case where a valid continued-answer quote could be rejected.
Event validation reuses one source-role index instead of reparsing once per quote.
The shared source index retains all question turns while bounding copied working
history to the four questions already used by the existing assessment helper; this
avoids quadratic history copies without deleting source context.

Overlapping extraction windows may produce duplicate proposed events. They remain
separate with source positions and task provenance; Part 4 can group them without
losing variants. Corrections to unavailable earlier events must retain a null link
and review reason; the model cannot fabricate cross-request references.

## Results and practical limits

`result.status` is COMPLETE, PARTIAL, FAILED or CANCELLED. Documents expose events,
recordValidation, sourceDiagnostics and per-core-range coverage. Tasks expose their
own status, raw responses, dispositions, rejected records, issues and anchor audits.
Core coverage is independent of record source validation: a partial range can still
contain retained source-valid records. These document results are an extraction-run
result, **not** a promoted `schema.v1.json` document bundle with the latter's stricter
coverage/reference requirements. Keep failed/unprocessed ranges visible downstream.
COMPLETE means all planned extraction tasks succeeded, not exhaustive AI recall or
correct semantics. Progress, awaited checkpoints and a final event are emitted to
`onEvent`. Callback failure stops subsequent calls and carries `error.extractionResult`;
it is not swallowed. This is an in-memory engine; durable job-store integration,
resume and user-facing progress come in Part 5, not this implementation.

Defaults: 16,000 source UTF-8 bytes per core, 1,000 overlap bytes, 16,384 output tokens
including thinking, 128 model requests maximum and 120 seconds timeout per request.
These application choices are configurable safety limits, not quality guarantees.
A longer answer can be split without omitting its governing question. A single huge
question beyond the existing context budget still needs explicit handling, not
truncation. Context/output exhaustion remains a visible failure; no automatic paid
retry or extra extraction pass is hidden behind this API.

The preview gives local UTF-8-based USD estimates at existing configured rates;
these are not tokenizer counts or billing guarantees. Actual returned provider token
usage is recorded per request and aggregated. Missing usage stays null; unpriced
cache usage makes the aggregate USD estimate unknown. Failed/cancelled in-flight
requests can still be billed. Codex/ChatGPT credits are separate from these provider
API token/USD fields. No model request was made while implementing/testing Part 3.

Provider specification checked 2026-10-15 against the official
[Opus 5.5 documentation](https://platform.claude.com/docs/en/models/opus-5-5/overview):
the repository's existing context/output and standard uncached rate settings agree
with that page. The model has always-on adaptive thinking, so this workflow does not
attempt to disable it or promise deterministic generation. No live capability or
accuracy qualification was performed. Budgeting includes the output/thinking limit.

## Local checks and privacy

Run `npm run tests:events`; Part 3 tests use only invented testimony and injected
mock transports. See `../../tests/events/EXPECTED_RESULTS.md` for intended outcomes.
Existing full-document checks include a synthetic PDF exceeding 200 pages; Part 3
adds extraction over a 225-page synthetic text/manifest with every original page
referenced. Those test passes are not evidence of live model quality.

No author drafts, gold labels, verifier reports or private testimony were consulted.
Raw extraction responses can contain private source text. Keep returned results in
private recovery/storage, not public logs, public reports, learned memory or version
control. The engine does not write files or log transcript content on its own.
