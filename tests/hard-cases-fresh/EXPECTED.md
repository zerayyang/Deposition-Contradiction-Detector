# Fresh held-out judicial classification set

SEALED EVALUATION MATERIAL. Do not read cases, reference findings or research
notes while tuning prompts. Inputs alone go to the detector. This is procedural
isolation, not filesystem access control. Exposure consumes the holdout.

## Frozen design and coverage

- 40 cases, 30 previously unused judicial opinions, all heldout.
- 20 DIRECT / 20 FALSE_POSITIVE /
  0 INFERENTIAL / 0 DEBATABLE.
- Maximum two pairs per opinion. Prior corpus and all prior research records were
  indexed by URL, caption and docket. Automatic and author checks found no overlap.
- Both quoted passages and pair-specific rulings were checked against fresh public
  court opinions or attributed opinion reproductions. Public judicial opinion text
  only; publisher headnotes/editorial material are excluded. Sources, page pinpoints,
  quote provenance and reproduction basis are sealed in reference findings/research.
- Every quote meets the fixed five-word shingle policy; minimum 1.000.
  Bracket characters/ellipsis markers are removed for coverage; bracketed words
  remain. Unicode compatibility and token case normalization are explicit in
  fidelity.mjs. Shorter fragments require exact token-sequence presence. Coverage
  supplements literal/punctuation review; it does not replace judicial interpretation.
- Two extra verified candidates are sealed research reserves. Selection ranks opaque
  IDs with the public seed in manifest.json and caps definite labels at 20 each,
  BEFORE any model run. No detector outputs or anticipated performance were used.
- One additional proposal is research-only because opinion-page pinpoints could not
  be verified. Rejected-candidate ledgers record insufficient verbatim quotation,
  missing/ambiguous pair rulings, chronology/page failures and retrieval failures.
  One recovered retrieval entry is explicitly not counted as a rejection.

## Fixed excerpt fidelity rule

Witness words are never changed. Preserve actual quoted questions. For a fragment
without a subject or an unnamed referent, when the opinion states its context, use:

`Q: [Question reconstructed from the opinion, p.N: <court-stated context>] <neutral question>`

Only court-stated factual context may enter that bracket, never the ruling or answer
key. Reconstructed questions are marked; questions remain neutral. Affidavits are
wrapped in marked neutral Q/A scaffolding, not misrepresented as actual deposition
questions. Role labels/line wrapping are canonicalized without altering witness words.
Framed witness answers and zero unknown/non-QA turns are required by the real parser.

## Files and separation

- inputs.json: id, split, transcript1, transcript2 ONLY; read by the runner.
- reference-findings.json: external rulings/proposed labels/citations; never model input.
- cases.json: sealed combined archival format, not the runner input artifact.
- research/: source snapshots, metadata-only exclusion index, author/drop ledgers.
- manifest.json: frozen hashes, selection rule, counts, exclusion reasons.
- preview.json and separation-audit.json: planning-only and prompt-isolation evidence.

No gold promotion or human approval is implied. No live accuracy has been measured.
A small balanced set does not establish real-world prevalence or deployment accuracy.
There is no inference-only coverage. Class labels follow court treatment under the
fixed mapping; sham-affidavit admissibility is not a finding of witness truth/perjury.

## Local preview and later independent evaluation

```sh
node tests/hard-cases/run.mjs --method events --corpus tests/hard-cases-fresh
```

Default is preview only: 80 extraction requests, estimated
USD 5.70, conservative local budget USD 60.15.
Comparison count and complete workflow cost remain UNKNOWN until validated extraction.
These are application-configured uncached prices, not verified billing. No paid call
was made to build or check this corpus. Do not add a spending approval flag without
fresh user authorization. No automatic retries or gap acknowledgement were added.

After an independently authorized run has saved all predictions, grade separately:

```sh
node tests/hard-cases/grade.mjs <results.json> tests/hard-cases-fresh/reference-findings.json
```

The existing grader behavior is preserved. To claim the proposed 90% check, require
all 40 cases complete and at least 36 strict type matches; separately report missing,
incomplete and review-required outputs. Do not claim success from a reduced graded
denominator. Do not repair or remove cases after viewing predictions without declaring
that evaluation contaminated and obtaining another genuinely unseen holdout.

Local checks use no provider calls. The final full-suite result is recorded in
STATUS.md and checks.json; no production prompt/scoring or prior approved test changed.
