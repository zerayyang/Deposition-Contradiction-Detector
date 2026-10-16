# Reviewed sources and running-build identity

The short-document analysis route previously did not carry caller-reviewed named
speaker roles into quotation verification. The event workflow already carried
these roles. Unknown named turns must remain boundaries, not inferred witnesses.

## Analysis API contract addition

`POST /api/analysis/plan`, `/api/analyze`, and `/api/analyze/stream` accept optional
`speakerRoles: [mapForTranscript1, mapForTranscript2]`. Each map uses exact printed
speaker labels and the existing WITNESS / QUESTIONER / OTHER roles. Nonempty maps
require `sourceRolesReviewed: true`: the caller asserts it reviewed source roles.
This is a caller assertion, not an independent proof of identity. Do not take
these roles from model output, a classifier label or a predicted confidence.
Reserved court labels cannot be remapped into witnesses.

Reviewed roles now reach section boundaries, model source metadata, literal source
validation, governing question lookup and source-reference offsets. Plan approval
is bound to roles. Recovery stores them and rejects changed assignments. Empty
maps retain existing short-input behavior; unresolved speakers stay unverified,
with null numeric scores. Existing event-workflow role review is unchanged. This
change adds no automatic name guessing or new UI role picker for the legacy route.

`GET /api/health` remains free and unauthenticated. `provenance` reports a startup
snapshot: code fingerprint, main prompt SHA256, prompt-file hashes, configured
model, startup time and an optional validated deployment commit SHA. Fingerprints
include server/shared JS, JSON and Markdown plus package manifests, so prompt and
schema edits invalidate identity too. No credentials or document text are returned.
The short-analysis plan and result also carry this provenance. A previously
running process cannot acquire these fields until restarted; do not infer current
build identity from HTTP 200 or uptime alone. Compare loaded fingerprints against
`captureBuildIdentity` from `server/buildIdentity.js` using the same checkout.

## Fictional regression fixture expectations

`server/sourceRoleTransport.test.js` embeds independent fictional testimony with
ordinary Q/A in the first document and named questioner/witness turns in the second.
With explicit reviewed roles: opposite form-signing assertions produce DIRECT
from the stub and CONFLICT_SUPPORTED / 90 from unchanged code, a bound named
witness quote and its governing Monday question. The number is an existing-rule
regression expectation, not a newly calibrated probability.

Without reviewed metadata, the exact named quotation stays UNVERIFIED_SOURCE,
null score, even when the model forges role fields. Court-to-witness mappings are
rejected. Changed role assignments change plan identity and cannot resume an old
plan. Streaming checkpoints retain role metadata, exact source text and findings.
`server/buildIdentity.test.js` verifies prompt/schema changes affect fingerprints
and that unauthenticated health invokes neither authentication nor a model.

Run:

```sh
node --test server/buildIdentity.test.js server/sourceRoleTransport.test.js
```

Six targeted checks and the full 369-check local regression suite passed. Production
build passed (existing bundle-size warning remains). No paid calls, gold-label
changes, private-source ingestion or automatic server restart occurred for this fix.
Local stub success does not establish real-document categorization or recall.

## Remaining diagnosis

The saved Level 2 handoff also reports an omitted target and unsupported evidence.
These are not repaired by allowing arbitrary speakers or loosening exact quotations.
The independent verifier must first check running-build identity, use explicitly
reviewed source-role metadata, and report source failures separately from supported
classification/evidence results. Never mark status-only matches as verified passes.
No classification definition, prompt rule, scoring formula, weight or approved label
was changed in this fix.

## Follow-up: governing anchors after reviewed roles

The live reviewed-role run confirmed role transport, but its six saved findings
remained rejected: the model supplied an opening thematic question as if it
immediately governed a later witness statement across another speaker's turn.
The opening was not role-attributed, and interruptions deliberately clear context.
The saved failures remain failures; no anchors or approved expectations were edited.

The legacy model input now includes a deterministic source_context_index for
named witness turns and answers without governing questions, using original
UTF-16 ranges. It contains no duplicate testimony, inferred identities, categories,
or scores. Null question remains null. Its bytes enter the existing cost/context
budget calculations, and all document sections remain compared. The prompt now
explicitly requires a null question anchor for those turns, while retaining an
exact witness-answer anchor and any genuine scope uncertainty.

Source binding returns structured diagnostic codes for missing governing question,
nonverbatim question/answer anchors, excluded quotes and invalid anchors. Separate
claim1LiteralValid/claim2LiteralValid fields distinguish exact witness wording from
fully verified source context. Existing claim-valid flags and numeric gating remain
unchanged. UI witness-context text and exported reports explain the distinction.
No fabricated question or failed anchor is silently stripped. A future model call
must demonstrate that the instruction improves output; local checks alone do not.

Additional independent fictional regressions exercise an unlabeled opening,
a non-questioner interruption, no inherited question, exact original offsets,
wrong/invented anchors and safe report rendering. Proposed outcomes are source
rejection/null scores for bad anchors, even when witness wording exists. A fresh
null anchor can locate a witness turn but establishes no missing question or scope.

## Independently identified section carry-over defect

The verifier reproduced a contradictory legacy section prefix using the fictional
interrupted witness fixture and 55-byte chunks with zero overlap: the new context
index said no governing question, but sectionDocument still attached the last old
Q in preceding_question. The splitter now derives carry-over only from the actual
source-parsed witness turn covering the section start and that turn's uninterrupted
governing question. Other-speaker turns, unattributed openings and fresh question
boundaries cannot inherit an older topic. Long uninterrupted answers still retain
their own full literal question. Original source/core coverage remains unchanged.

Final local result: 375/375 regression checks passed, changed-file lint passed and
production build passed with the existing bundle-size warning. The six saved live
findings were never rewritten or promoted; live prompt efficacy and missing-target
recall remain unproven. This follow-up made zero paid calls and has not restarted
the running backend or deployed automatically.
