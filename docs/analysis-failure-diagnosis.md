# Planning and extraction failure investigation — October 16, 2026

## Observed, before fixes

Read-only deployed health and approved free planning checks returned HTTP 500 with
`FUNCTION_INVOCATION_FAILED`. Health needs no transcripts or model, so this is a backend
startup failure. User-supplied Vercel Runtime Logs confirmed the exception:
`Error: Set DEMO_USER_IDS for the private demo.` in `server/configuration.js:6`.
The production demo allowlist must be configured and a new deployment completed.
This startup exception is not a PDF size/model context error. No repeated paid
long-document run was made.

Local preparation of the large saved case separately stopped at unreviewed source labels.
An apparent heading was conservatively flagged as a speaker. Review labels before reading;
do not automatically assign a person/role from a heading. Resolving startup does not bypass
this existing review gate or configured request-count/budget allowances.

A saved fictional extraction stopped because complete JSON was inside a Markdown fence.
Decoding the fence exposed additional bad per-event citations: four proposed events cited
sources present only in other events. Eight events passed fresh local source validation;
the whole response was still incomplete. Removing the wrapper alone is NOT a complete fix.
No saved case was modified during diagnosis.

## Changes

- Recognize exactly one whole-response optional json Markdown wrapper. Preserve raw text
  and record BARE_JSON versus MARKDOWN_JSON_FENCE. No JSON repair, quote rewriting,
  prose stripping, truncation acceptance or validator weakening.
- Add explicit per-event citation instructions. Shared passages must be repeated under
  that event's own distinct IDs; another event's source is not local support.
- Use Anthropic's documented structured JSON transport with provider-compatible schema
  normalization. The full existing schema/source validators remain authoritative.
  Compatibility must be smoke-tested: local schema compilation alone is insufficient.
- Revalidate saved raw outputs before recovery. Fully valid responses with matching source/
  instruction plans can be reused even across unrelated backend fingerprint changes.
  Corrupt completed caches stop before charging. Partial invalid responses remain partial.
  Changed extraction instructions/transport change the plan and require a new reading plan;
  existing saved reviews remain available. No automatic migration/relabeling occurs.
- The Vercel adapter catches import/startup exceptions and returns safe JSON startup codes
  rather than a generic platform body when execution reaches the adapter. Missing demo
  access configuration, missing model key and missing bundled files get distinct codes.
  Errors before the adapter executes still require platform runtime logs.
- Frontend errors distinguish unreadable response formatting from actual output truncation,
  and identify an HTTP 500 backend failure without claiming the model failed.

## Validation boundaries

Offline tests include whole-fence decoding, malformed/truncated JSON rejection, exact-source
validation, zero-call recovery of fully valid fixtures, corrupt-cache rejection, Vercel
import without listeners, startup failure codes and HTML/platform-error messages.

The deployed startup exception is confirmed as missing `DEMO_USER_IDS`. Restoring
health after configuration/redeployment still requires a fresh hosted check. No deployment, real-case changes, label changes or hosting
purchase is part of these local changes. Existing 60-second Vercel function duration and
request limits remain practical blockers for long phases and large recovery payloads.
Do not claim full hosted end-to-end success from local tests or a successful frontend load.

References: [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[Vercel runtime file guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions),
[Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## Actual checks in this implementation run

- Broad offline regression suite: 354/354 passed, including cancellation during memory retrieval.
- Production Vite build passed; existing >500 kB bundle-size warning remains.
- Changed implementation files pass ESLint. Repository-wide lint still reports the
  existing unused initial `minute` assignment in server/scoring/temporal.js; scoring
  logic was not edited in this task.
- Three provider HTTP requests total, each individually capped below US$0.50 with no
  SDK retries: first rejected at schema compilation with HTTP 400/no usage; second
  extraction COMPLETE (2 proposed events, valid sources, no issues); third comparison
  COMPLETE (one DIRECT result, exact current citations, 1/1 pair accounted for).
- The comparison smoke used fictional, mocked extraction records. It was not an
  end-to-end live extraction-to-classification benchmark or an accuracy evaluation.
- Successful-call recorded usage estimates: USD 0.042556 + 0.058736 = 0.101292 at
  configured rates, not verified billing. Rejected request billing is unknown because
  no usage was returned. Total conservative approval across all three requests was
  USD 0.836648, below the user's USD 10 limit. No real testimony was sent to Claude.
- Initial structured-output grammar failed because the transport included unrelated
  definitions. Keeping only reachable definitions passed the next provider check;
  no automatic fallback or hidden retry was added.

These local edits were not deployed or committed and no real Supabase migration or
feedback approval was applied. Hosted backend health was HTTP 500 before edits;
runtime logs subsequently confirmed missing `DEMO_USER_IDS`. The user supplied the
admin account ID and initiated a production redeployment; its health is being checked.

## Production configuration recovery — October 16, 2026

After the user configured the production demo allowlist and redeployed commit
`fffa192`, the deployed `/api/health` returned HTTP 200 with `status: ok` and
`callsClaude: false`. An unauthenticated `/api/events/plan` returned HTTP 401.
An authenticated extraction-plan preview using fictional testimony returned HTTP 200
and a two-request cost estimate. No model requests were started; no case was saved
or modified. Deployed code fingerprint:
`0d83ecbe797ce83e2817efb2118e2d8f94d22a9ee64af69c34917c324c83cec5`.

The missing-allowlist startup blocker is resolved. These free checks do not establish
paid extraction/comparison accuracy or completion under Vercel time limits. The local
response-handling and Part 7 changes remain uncommitted and are not in this deployment.
Twelve targeted local deployment/response-format checks passed during this recheck.
