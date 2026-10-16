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
