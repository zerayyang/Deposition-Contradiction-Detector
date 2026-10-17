# Deposition Contradiction Detector

Compares two depositions from the same witness and lists statement pairs for a lawyer to review, each labelled **DIRECT**, **INFERENTIAL** or **FALSE_POSITIVE**. Claude reads the testimony and decides the logical relationship. The app's own deterministic code checks every quote against the source and calculates any numeric score. The model never supplies a number, and its label cannot change one.

This is a review aid, not a legal conclusion. Scores are rule-based evidence indicators, not calibrated probabilities.

## Requirements

- **Node.js 24** and **Git**.
- An **Anthropic API key** with access to `claude-opus-5-5`. Calls are billed to that key's account.
- A **Supabase project**. The app saves cases and original files there and requires sign-in, including when run locally. Without it the first screen shows "Connection needed". Apply the SQL files in `supabase/migrations/` in date order; see `docs/SUPABASE_SETUP.md`.

## Quick start

```sh
git clone https://github.com/zerayyang/Deposition-Contradiction-Detector.git
cd Deposition-Contradiction-Detector
node start.mjs
```

On first run the launcher asks for your Anthropic key (input hidden), saves it to `.env`, installs dependencies, starts the API (port 3000) and the web app (port 5173), and opens http://localhost:5173. Add your Supabase values to `.env.local` (see Configuration), restart, create an account, and sign in.

Practice files: `public/examples/riley-morgan-*.pdf`, with expected answers in `public/examples/expected-results.html`.

## How an analysis works

Every paid step shows a cost preview and starts only after you approve it. There are no automatic retries.

**Read, then compare** (default)
1. **Read.** Each transcript is split into small ranges. For every witness answer, Claude records events with exact quotes, or marks the answer as no event or unresolved. Code checks each quote and field against the source; records that fail are set aside, never repaired. Unread or failed ranges stay visible as "Reading incomplete — review required".
2. **Compare.** Every group of events in one transcript is compared with every group in the other; no keyword filter drops pairs. Claude labels each related pair.
3. **Review.** Comparisons of the same witness answers that reach different labels are combined into one "Labels disagree" card with every view and no score.

**Direct comparison** (previous method): Claude reads both transcripts in one request (or a few for long files) and returns labelled pairs. The same quote validation and scoring apply.

### Choosing a method (measured on real runs)

| Test | Direct comparison | Read, then compare |
| --- | --- | --- |
| Riley Morgan sample, 1 page each | 1 request, $0.15; all expected labels right | 3 requests, $0.64; all expected labels right |
| Real depositions condensed to 16 pages each (12 audited hard pairs) | 1 request, $0.30; every reported label matched, 1 expected pair missed (plus 1 debatable), 0 false alarms | 19 requests, $6.51; 0 false alarms on the 8 look-alike pairs, 1 expected pair labelled differently, 1 possible extra finding |
| Full real pair, 219 + 479 pages (estimate only) | 6 requests, about $5 estimated | 164 reading requests plus comparisons; not practical |

Use **Direct comparison** for long documents. **Read, then compare** gives per-answer accounting and visible gaps, and suits shorter documents.

## The score

When code rules find a conflict:

```
score = 100 × E × (0.5 + 0.5 × C)
```

- **E** is the strength of the strongest conflict rule that fired (time ranges, quantities, location/activity, state, timeline, knowledge, activity polarity).
- **C** is how firmly the witness said it (0.30–1.0, from wording such as "I clearly remember" or "I think"); the weaker of the two statements counts.
- Compatible evidence gives a separate index of at most 15.
- If no rule applies, the quote fails source validation, or context is unresolved, the card says **Not evaluable** and shows no number.

Only literal witness words reach the rules. A card keeps its review flag when it refers to testimony outside the read range ("check the link") or when labels disagree.

## Reliability and operations

- **Spending:** each phase needs approval of its exact plan; default allowance 512 requests and $25 per phase (`MAX_ANALYSIS_REQUESTS`, `MAX_ANALYSIS_BUDGET_USD`). Hosted runs reserve each request's worst-case cost before calling and stop when the approved budget cannot cover the next one.
- **Time limits:** model requests may take up to 600 s locally (`MODEL_TIMEOUT_MS`). On Vercel each step is limited to 240 s inside a 300 s function (`vercel.json`), so very slow requests can still fail there.
- **No lost work:** inputs and originals are saved before paid work. Hosted runs execute one model request per step and save a signed claim, reservation and result in Supabase Storage, so a cut-off step can be inspected and the job continued without repeating finished work. Local runs keep private recovery files in `.analysis-jobs/`.
- **Overload:** each server instance admits one heavy analysis at a time, plus per-user and per-IP rate limits; excess requests get 429 with Retry-After instead of crashing.
- **Logs:** one JSON line per event (HTTP request, model request, hosted job start, step, failure and cancel, cron). Every API response carries an `X-Request-Id`, and the same ID appears on every log line the request produced. Logs contain identifiers, counts, costs, durations and error codes, never testimony or keys.
- **Scheduled check:** Vercel Cron calls `/api/cron/health` daily at 13:00 UTC (authenticated by `CRON_SECRET`). It checks configuration without calling Claude and logs `cron_health_check` as OK, DEGRADED (with the failing check names), UNAUTHORIZED or NOT_CONFIGURED.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | server `.env` / Vercel | Claude access |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` / Vercel build | Browser sign-in and case storage |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server / Vercel | Server-side sign-in checks and hosted job storage (defaults to the VITE values) |
| `DEMO_USER_IDS` | production | Comma-separated Supabase user IDs allowed to run analyses |
| `ANALYSIS_JOB_SIGNING_KEY` | Vercel | Signs hosted job records; set it separately from the API key |
| `CRON_SECRET` | Vercel | Authenticates the daily health check |
| `MAX_ANALYSIS_REQUESTS`, `MAX_ANALYSIS_BUDGET_USD`, `MODEL_TIMEOUT_MS` | optional | Limits described above |
| `ANALYSIS_JOB_DIR`, `PORT`, `HOST` | optional, self-hosting | Recovery directory and server address |

No Supabase service-role key is used. Never commit `.env` or `.env.local`.

## Checks

```sh
npm test        # every offline test (fake model transport, no paid calls)
npm run lint
npm run build
```

`npm test` currently runs 559 tests. They check source validation, scoring rules, status handling, recovery, logging and the cron, using fictional inputs and a fake AI. They do not measure live accuracy; the measured runs above do, on a small set of cases.

## Known limits

- Accuracy has been measured on one fictional sample and one condensed real case (12 audited pairs, not lawyer-verified). Labels can vary between runs.
- Many real comparisons (for example opinions about value) match no scoring rule and show "Not evaluable".
- Very long documents are expensive with Read, then compare.
- PDFs with scanned (image-only) pages need OCR first; the app lists such pages and blocks analysis.

## Project map

| Path | Purpose |
| --- | --- |
| `start.mjs` | One-command local launcher |
| `src/` | React app (upload, review cards, reports) |
| `server/app.js`, `server/server.js`, `api/index.js` | API, logging and Vercel entry |
| `server/events/` | Read, then compare: reading, comparison, validation, scoring bridge |
| `server/documentAnalysis.js`, `server/proper_prompts.md` | Direct comparison and the classification instructions |
| `server/humanConfidencePipeline.js`, `server/scoring/` | Quote validation, rules and the score formula |
| `server/cloudAnalysis.js`, `server/cloudJobStore.js` | Hosted step-by-step jobs |
| `server/cronHealth.js`, `server/requestContext.js` | Scheduled check and request IDs |
| `supabase/migrations/` | Database setup |
| `docs/` | Design notes for individual features |
