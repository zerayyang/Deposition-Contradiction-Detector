# Level 2: saved real-world testimony

This is an authoring workflow, not an app change or automatic training. It accepts two saved testimony documents plus a separate lawyer/judge analysis. No cases are generated or labels approved by importing documents. Only the explicit `generate` command calls Claude. `prepare` and `append` are local. Start authoring in a fresh author-only chat using LEVEL2_PROMPT.md; keep the verifier in another fresh chat. Only approved tests/gold.json is handed to the verifier. Do not send verification observations back into authoring. Role instructions and separate files are not an OS access-control boundary.

## 1. Save/import the three documents

Accepts UTF-8 TXT/MD (bytes and whitespace preserved) or selectable-text PDF. DOCX/scanned PDFs require an explicitly reviewed text export/OCR first; unsupported files fail rather than silently converting. PDF.js writes a stable extraction with page-to-offset spans and keeps the original PDF bytes. Exact PDF passages mean exact substrings of that saved extraction; visual reading order, ligatures and line layout must be checked against the original. Page spans are available in manifest.json. Offsets are zero-based JavaScript UTF-16 code units, end-exclusive, not bytes or PDF printed line numbers.

```sh
npm run tests:level2 -- prepare --id matter-001 --testimony1 /absolute/testimony-a.pdf --testimony2 /absolute/testimony-b.txt --reference /absolute/analysis.txt --source1 'Proceeding, witness, date, official URL or saved-source citation' --source2 'Proceeding, witness, date, source citation' --reference-source 'Author/judge, document title, date, source citation'
```

Each unique bundle lives under ignored `tests/author/level2-private/matter-001/`. It contains original byte snapshots, extracted texts and a manifest with source citations, SHA-256 hashes and extraction provenance. Reusing a bundle ID fails. Verify permissions to use real data before voluntarily sharing it with an author model; this workflow itself keeps documents local. Do not put originals/reference material in public/examples or commit them by default.

## 2. Draft only when requested, then append

Generate new drafts from an imported bundle:

```sh
npm run tests:author:level2 -- generate --bundle matter-001 --count 5
```

This makes one Claude author call using fresh messages containing only the independently labeled testimony documents and reference analysis. It does not read gold, previous cases, app code or verifier output into the prompt. The existing Anthropic credentials/model configuration applies; `--model` overrides it explicitly. Temperature zero is requested where supported, with the same recorded known-model exception as Level 1. SDK retries are disabled. Sources and raw request/response, validation errors, token usage if returned and proposed cases remain in a private `generation-*` audit directory. No dollar spend is estimated. Bundles over 120000 UTF-16 units fail before a request rather than being silently truncated.

All returned proposals must pass exact passage/source/label validation and match the requested count before any draft append. Missing/invalid cases are reported, never repaired or silently dropped; retrying is an explicit new request. Valid results append as drafts, never approved gold. The generation audit does not become verifier input. The count defaults to five and can be 1–25. Existing Level 1 generation and flags are unchanged.

Alternatively author proposals in the isolated Codex author chat and use `append` below, without an additional API call.

A separate author-only chat reads the bundle and follows LEVEL2_PROMPT.md. When explicitly requested, use the generation command above; importing alone does not generate cases. Save future proposed cases as an array in a local file (prefer inside the ignored bundle). Each proposal has this shape; placeholders below are documentation, not runnable cases or expected app results:

```json
{
  "case": {
    "id": "l2-matter-001-UNIQUE_ID",
    "transcript1_text": "EXACT_CONTIGUOUS_PASSAGE_A",
    "transcript2_text": "EXACT_CONTIGUOUS_PASSAGE_B",
    "expected_type": "DIRECT",
    "expected_evidence": "CONFLICT",
    "expected_score_band": "MODERATE",
    "tricky_feature": "Source/context feature to test",
    "rationale": "One sentence explaining the proposed labels from testimony, with uncertainty noted.",
    "status": "draft"
  },
  "passages": {
    "testimony1": {"start": 0, "end": 26, "quote": "EXACT_CONTIGUOUS_PASSAGE_A", "location": "Original page/line or paragraph reference"},
    "testimony2": {"start": 0, "end": 26, "quote": "EXACT_CONTIGUOUS_PASSAGE_B", "location": "Original page/line or paragraph reference"}
  },
  "reference_findings": [
    {"start": 0, "end": 20, "quote": "EXACT_ANALYSIS_PASSAGE", "location": "Analysis page/paragraph reference", "relation": "supports"}
  ]
}
```

Replace all placeholder lengths with actual offsets. Allowed reference relations: supports, disagrees, context_only. A reference passage is not a testimony passage. Analysis stays in the author-only proposal audit. Gold receives only testimony provenance and an audit hash, never reference_findings. Reference findings and labels are not automatically equated.

```sh
npm run tests:level2 -- append --bundle matter-001 --proposals /absolute/proposals.json
```

Append validates source hashes, exact text/offset matches, citations, draft status, labels and ID uniqueness. It preserves every existing draft/approved/rejected row and appends only new drafts; duplicates and malformed proposals fail the whole append, without dropping or repairing cases. A lock, snapshot check and atomic write guard the update. An author-only append-intent audit preserves proposals and the previous corpus hash; if interrupted, inspect current drafts before rerunning—duplicate IDs are refused. It never writes gold.json. Avoid concurrent edits with other author/review tools; the lock coordinates Level 2 appenders, not arbitrary editors.

## 3. Human review and promotion

```sh
npm run tests:approve -- --ids l2-matter-001-UNIQUE_ID
```

Existing interactive approval now shows the source citations and separate reference passages for Level 2 before the complete test. It rechecks document hashes, passage provenance and proposal content before approval. Only your explicit `a` promotes the reviewed draft. `r` retains rejection, `q` leaves pending. Piped auto-approval remains refused. To edit a Level 2 proposal, reject/hold the old draft and append a corrected proposal with a new ID; this preserves the original audit instead of silently changing passages or labels. Existing Level 1 review remains unchanged. Keep the private bundle available for approval; a missing/tampered bundle blocks approval. Approved source references are part of the case's content hash.

The verifier reads approved gold only, never this bundle, drafts or reference analysis. Its HTTP request remains exactly transcript1/transcript2. Approval does not imply a calibrated score or general legal accuracy.

## Tooling checks and expected outcomes

`node --test tests/author/level2.test.mjs tests/author/schema.test.mjs tests/author/batch.test.mjs` uses disposable synthetic documents in OS temporary directories. These are protocol fixtures, not new corpus cases. Expect: byte/text preservation, PDF extraction provenance, append preservation, exact passages/citations, duplicate/source-tamper rejection, missing-source approval refusal, draft-only status, separate reference findings, metadata/hash protection and no automatic promotion. No app classification, evidence verdict or numeric score is expected from these tooling tests. Unknown content remains for human review, not auto-correction. Existing gold/draft files must remain byte-identical after the checks.

## Implementation check

The complete `tests:unit` harness passed 51 tests during implementation, including the seven Level 2 author checks and a verifier request-isolation check. Tests used only temporary synthetic documents and a stubbed local HTTP server; no cases were added to the real corpus, no labels were changed, and no paid calls were made. Localhost binding required permission outside the sandbox. This is tooling validation, not a result for real-world testimony.

The generation extension was checked with stubbed Claude responses: fresh separated source payloads, draft-only append, retained token usage, preserved invalid raw responses and no hidden retry. The complete local harness passed 53 tests after this extension. No live generation or approvals were performed.
