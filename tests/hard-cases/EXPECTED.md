# Outside-sourced hard cases — proposed, not approved

This is a new research corpus. Nothing here replaces existing tests, promotes gold,
changes production instructions, or establishes a measured accuracy result.

## Delivered coverage — independently source-checked

- 67 retained drafts out of the original 70: 40 judicial sham-affidavit pairs,
  9 famous controls and 18 ContractNLI adaptations. All remain unapproved.
- Judicial proposals: 14 DIRECT, 22 FALSE_POSITIVE, 4 DEBATABLE. No inference-only
  ruling qualified; INFERENTIAL coverage is zero, not manufactured.
- Famous controls: 5 Clinton, 3 Clemens, 1 Bonds; all DEBATABLE. Bonds is a
  same-session control, not testimony from two separate proceedings.
- ContractNLI: 8 Contradiction / 8 Entailment / 2 NotMentioned original annotations,
  across 18 distinct documents, CC BY 4.0. All app mappings remain DEBATABLE.
  Original NLI annotations are not judicial classifications of testimony pairs.
- Tuning: 33 (7 DIRECT / 11 FALSE_POSITIVE / 15 DEBATABLE).
  Heldout: 34 (7 DIRECT / 11 FALSE_POSITIVE / 16 DEBATABLE).
- Every original ID has a fresh review in `verification/`; 67 retained pairs have
  both quotations checked. PDF line wrapping is whitespace-normalized, not fuzzy
  word matching. Three judicial pairs use fresh web opinion text rather than
  downloadable PDF bytes; those snapshot hashes are explicitly distinguished.
- Dropped from the original 70: Walter (complete quotations inaccessible for fresh
  verification); ContractNLI 22-nda-10 and 227-nda-11 (full NotMentioned premises
  contain signature/address headings interpreted as speaker turns). They remain
  in research with exclusion reasons; neither premise was truncated to hide this.
- Repairs: two source-punctuation differences; several same-document source links;
  Hamilton DIRECT to DEBATABLE because the excerpt lacked speaker attribution;
  source citations, a contradictory audit note and a non-neutral reconstructed
  question. No production rule or prompt was changed to make a case pass.
- Three earlier excluded research proposals remain excluded for unverified
  pinpoints/wording; they were never part of the original 70-case audit.
- Stanford contradiction corpus and DECODE remain unincorporated because their
  applicable releases/licenses were not independently checked in this pass.
  This does not assert that they lack an open license.

## Read the files safely

- `cases.json`: requested archival format, including proposed answers and provenance.
- `inputs.json`: detector-facing IDs, split and testimony only. The runner reads this
  file and never loads judicial analysis, proposed labels or reference findings.
- `reference-findings.json`: external rulings, proposed labels, rights and citations;
  keep this out of production prompts, retrieval memory and candidate discovery.
- `research/*.md`: source audits, exclusions and quote-verification limitations.

Records without verified quotation wording or quotation/ruling pinpoints remain in `research/`
only and are excluded from assembled cases, inputs and cost previews; see
`manifest.json` for IDs and reasons.

These are deliberately short excerpts. They do not test full-deposition recall,
OCR, cross-section retrieval, numeric confidence or whether a witness told the truth.
An excerpt can omit important case context; read the cited opinion before approving it.
Original opinion pages are provenance references, not invented PDF page manifests
for the reconstructed Q/A strings; detector offsets refer to those input strings.
A court's sham-affidavit decision concerns admissibility/summary judgment. It does
not automatically prove perjury, ground truth of an event, or a particular app label.

## Expected classifications

| Proposed label | Required external support | Meaning for review |
| --- | --- | --- |
| DIRECT | Court identifies an explicit, same-subject contradiction | Both statements cannot hold under their stated shared context. |
| INFERENTIAL | Court specifically identifies inconsistency through implication/inference | Conflict needs a stated inference; do not manufacture examples to fill a quota. |
| FALSE_POSITIVE | Court treats the pair as compatible clarification, elaboration, ambiguity or omission | No demonstrated contradiction. An omission is tagged separately. |
| DEBATABLE | No pair-specific authoritative classification, or mapping remains uncertain | Discussion only; exclude from any accuracy denominator. |

A judge accepting an affidavit does **not** alone imply FALSE_POSITIVE: an explained
but explicit contradiction can still be DIRECT. A judge rejecting an affidavit for
procedure or unsupported conclusions does **not** alone establish DIRECT.
A jury acquittal is not a finding that every disputed statement was true.
Famous statements remain DEBATABLE unless the authority resolves that exact pair.
Research datasets, if included, are identified separately and are not judicial truth.

Each case preserves both quoted passages, location references and a separate ruling.
Questions absent from an opinion are neutral reconstructed scaffolding, explicitly
noted; they are not attributed to an examiner and must add no factual premise.
Where a court quotes an examiner's question, it remains a Q turn, never witness A.
PDF line wrapping can be collapsed and Q./A. role labels canonicalized for
readable detector inputs; source audits record these formatting transformations.
This is literal-word/source checking, not byte identity with a PDF file.
Ellipses/omission markers quoted by a court remain visible; a shortened judicial
quotation is not a complete transcript. Do not silently fill omitted testimony.

## Splits and approval

Splits are deterministic and grouped by opinion/proceeding URL (or original dataset
document ID, rather than the shared archive URL) to avoid near-
duplicate statements from the same proceeding leaking across tuning and heldout.
The assembler seeks approximately half by count and balances labels/source families;
small or uneven source groups prevent exact balance. All labels remain proposals.
Do not tune production code using heldout answers. Any reviewed correction needs an
explicit human decision and a documented provenance change, not detector agreement.
Independent promotion to the existing author/verifier workflow needs human approval.

## Run locally — no model request by default

```sh
node --test tests/hard-cases/runner.test.mjs tests/hard-cases/corpus.test.mjs
node tests/hard-cases/run.mjs --method direct --split all --repeat 2
node tests/hard-cases/run.mjs --method events --split heldout --repeat 1
```

The last two commands build the app's own plans and print a cost preview only.
They do not measure classification accuracy. A later independent verifier must
match the intended source pair before grading its type; an omitted candidate is
missing output, not a demonstrated wrong category. Compatible-pair omission policy
must be recorded separately. Never count untested draft labels as verified passes.
No credential is read and no provider SDK is initialized in preview mode.
Prices are application-configured uncached USD estimates, not a billing guarantee.
Events previews cover **extraction only**. Comparison requests/cost cannot be known
until validated events exist; an estimate must not claim that reading is the whole cost.

Paid execution is deliberately opt-in with `--approve-usd=CAP`; **do not add this
flag without fresh explicit spending approval**. A future paid run also needs an
exported credential; the runner never reads `.env`. It reserves a conservative local
ceiling before every request, disables retries, stops on incomplete phases, and never
automatically acknowledges reading gaps. It refuses an insufficient initial phase
cap. Comparison is refused when its new plan exceeds the remaining reserved cap.
Local ceilings cannot guarantee provider billing if configured pricing is stale.
The runner prints statuses/counts only, does not grade draft answers or auto-promote
cases. An explicitly approved paid run saves raw responses under a new temporary
audit directory and reports only its path plus counts/statuses. The directory is
not a durable report; preserve it deliberately if needed. Use the isolated verifier
for an approved evaluation rather than treating these statuses as accuracy results.

## Known hard cases (owner decision 2026-10-17)

- `hard-sham-b-ruple-change-orders` stays DIRECT, as the court ruled. The later statement opens
  "Contrary to Article 6.2…", so the witness draws a contract-versus-practice distinction, and the
  detector has read it as a reconciliation in every run so far. It is kept as a known hard miss and
  is not relabelled or tuned for specifically.

## Fixture-fidelity audit (2026-10-17)

Rule fixed before editing: where a quoted answer is a fragment with no subject, or refers to an
unnamed thing, and the opinion explicitly states what it concerns, the reconstructed question
carries that court-stated context in brackets with the page. Witness words are never changed.
Applied to both splits: 7 tuning (American Rena, Bauer, three ConAgra, Willard, Satterfield) and
3 held-out (Cole, Mansoori, Thomas). Hamilton and Maisha were not audited (no local opinion text).
