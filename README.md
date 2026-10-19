# Deposition Contradiction Detector

**Compare two transcripts. Review possible contradictions. Trace each finding to its source.**

An AI-assisted workspace for reviewing testimony from the same witness. It identifies potentially conflicting statements, classifies their relationship, and checks how strongly additional reviews support that classification.

**[Open the hosted app](https://deposition-contradiction-detector-nine.vercel.app/)** · **[Explore the confidence demo](https://deposition-contradiction-detector-nine.vercel.app/hybrid-confidence-demo.html)**

The hosted app requires sign-in. AI analysis is billed to the deployment’s configured Anthropic account and requires cost approval. The interactive demo makes no model calls.

> A review aid, not a legal conclusion. A confidence percentage is currently an uncalibrated support index—not the probability that a finding is correct or that a witness is lying.

## What you can do

- **Compare testimony:** upload searchable PDFs, TXT or Markdown, or paste transcript text.
- **Review classified findings:** Direct, Inferential, Not a contradiction, or Uncertain when the analysis and its double-check disagree.
- **Check the evidence:** inspect quotations, available source references and highlighted locations in the full transcript.
- **See confidence alongside findings:** six model checks and a separate reviewer contribute to a code-calculated score.
- **Control spending:** review the estimated cost, choose a maximum allowance, and retain completed work if the run stops.
- **Save and export:** reopen cases, add review notes, and choose which findings to include in a printable PDF report.
- **Suggest corrections:** submit feedback for independent review and optionally release approved, private lessons for future analyses.
- **Adjust the interface:** Settings links to the interactive confidence demo and offers reduced visual effects.

## Try it

1. Open the hosted app and sign in.
2. Create a case, or save the included sample as a case.
3. Add both transcripts. For a first run, use a short, searchable Q/A example.
4. Select **Review documents**, inspect the cost preview, and approve the review.
5. Review the findings, source context and confidence checks. Expand details for gaps or failed checks.
6. Use **Export PDF** to choose the findings you want, then select **Save as PDF** in the print dialog.

For a free explanation of the scoring controls, use **Settings → Explore demo**. Fictional practice PDFs are in [`public/examples/`](public/examples/), with a separate [expected-results guide](public/examples/expected-results.html).

## How it works

```text
Two transcripts
      ↓
Parse text and plan comparisons → approve cost
      ↓
AI proposes pairs and answers structured decision questions
      ↓
Shared code derives labels; source checks verify quotations/context
      ↓
Optional borderline double-check → disagreement shown as Uncertain
      ↓
Automatic confidence checks within the approved allowance
      ↓
Saved findings, source review and PDF export
```

The current workspace uses the document-comparison pipeline. Long inputs are divided into sections for cross-document comparison; cost grows with the planned comparison work. The earlier event-extraction workflow is not the current workspace flow.

The model answers questions about subject, occasion, compatibility and values. Shared code derives the category using fixed rules. Source validation and witness-role checks are separate: an unverified quotation is not silently accepted as verified evidence. Rejected suggestions, unresolved sources and incomplete coverage remain visible in the result or its review details.

Progress distinguishes **finished processing** from **fully validated results**. A completed comparison can still have rejected findings. During scoring, progress follows completed confidence checks.

### Classification and confidence are different

**Direct** describes the proposed kind of conflict. It does not automatically mean the finding has strong support. A Direct finding can receive a low confidence score when later checks disagree.

New confidence reviews use this provisional formula:

| Component | Maximum | Contribution |
| --- | ---: | --- |
| Six model checks | 60 points | Matching checks ÷ 6 × 60 |
| Separate reviewer | 30 points | Agrees: 30; agrees with concerns: 15; disagrees: 0 |
| Deterministic code support | 10 points | Up to 10 for applicable, category-aligned rule support |

**Example:** five matching checks (50) + reviewer agreement (30) + full code support (10) = **90%**.

If no code rule applies, its ten points are excluded: the earned vote and reviewer points are divided by **90**, then multiplied by 100. Missing required model checks or failed source verification do not become zero-confidence evidence; the finding remains unscored with a reason. Older saved results retain their original scoring policy.

The six checks use two model identities, three calls each. They use the same neutral decision task with statement-order variations. A separate reviewer sees the source context without seeing the original label or votes. All checks derive categories through the same code rules; the model does not supply numeric confidence. These calls are **not statistically independent** and can share mistakes.

Current configuration uses `claude-sonnet-5-5` and `claude-opus-5-5` for confidence checks. Model access is required on the account running the backend. The code supports versioned calibration inputs, but the current weighted score is **not a trained statistical calibrator**. Token log probabilities are not part of this score.

### Approved memory

Feedback and lessons are stored in Supabase, with authorization enforced by the database:

1. A user proposes a correction and explanation for a saved finding.
2. An authorized reviewer checks the original sources and approves, rejects or requests more context. Users cannot approve their own corrections.
3. Approval alone does not create production memory. A reviewer must separately release a general lesson, with search terms and an explicit privacy/evaluation check.
4. Future account-based analyses retrieve at most three relevant released lessons for that case owner, using deterministic search-term matching.

Lessons are reasoning reminders—not evidence for a new case. They cannot supply missing facts, override source validation or directly set numeric confidence. This is **retrieval-based memory, not model retraining**. Unavailable memory is reported and analysis can continue without it.

## Run locally

### Requirements

- Node.js **24 or newer** and Git.
- An Anthropic API key with access to the models configured in the repository.
- Supabase is optional for local use; it is required for the hosted account-based workspace and review features.

```sh
git clone https://github.com/zerayyang/Deposition-Contradiction-Detector.git
cd Deposition-Contradiction-Detector
node start.mjs
```

On first run, the launcher requests an Anthropic key with hidden input if no `.env` exists, installs dependencies if needed, and starts the API and Vite frontend. Open **http://localhost:5173**. Stop both processes with **Ctrl+C**.

For explicit setup, copy [`.env.example`](.env.example), fill in your own values, and install dependencies with `npm ci`. Keep the provider key on the server; never expose it through a `VITE_` variable.

**Local no-account mode:** when Supabase is unconfigured and the API is running on the supported local loopback configuration, cases and original files are stored in this browser. Clearing site data deletes them. Feedback approval and approved-memory features need signed-in accounts and are unavailable in this mode.

The static confidence demo is also available at `/hybrid-confidence-demo.html` when serving the app; opening it does not call the API.

## Supabase and hosting

The production configuration uses **React/Vite**, an **Express API on Vercel**, and **Supabase Auth, Postgres and private Storage**.

For an account-based installation:

- Provision an owner-scoped `public.cases` table with the fields used by [`caseStore.js`](src/lib/caseStore.js), including transcripts, results and review notes. The migrations assume the base cases table and Supabase Auth/Storage already exist; they are not a complete empty-project bootstrap.
- Review and apply the SQL in [`supabase/migrations/`](supabase/migrations/) in dependency order. Later migrations add private originals, recoverable jobs, feedback review, private memory, admin access and short review explanations.
- Set the correct local and production URLs in Supabase Authentication’s URL configuration.
- Configure the environment variables below in Vercel before deployment.
- Set up admin access through the admin migration. Never put the admin passphrase or account credentials in this README or frontend code.

**Pushing code does not apply database migrations.** For example, removing the ten-character review minimum also requires [`202610190003_short_feedback_notes.sql`](supabase/migrations/202610190003_short_feedback_notes.sql) in the database.

### Environment variables

Use [`.env.example`](.env.example) as the configuration template. Do not commit populated environment files.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-side model access |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser sign-in and owner-scoped storage access |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase access; defaults to the corresponding Vite values |
| `DEMO_USER_IDS` | Accounts allowed to run analyses in production |
| `ANALYSIS_JOB_SIGNING_KEY` | Separate key for signing hosted job records |
| `CRON_SECRET` | Authenticates the configured health cron |
| `MAX_ANALYSIS_REQUESTS`, `MAX_ANALYSIS_BUDGET_USD` | Server request and spending ceilings |
| `MODEL_TIMEOUT_MS` | Model-call timeout, subject to hosting limits |

The browser uses a Supabase publishable key and the user’s session, not a service-role key. API keys and signing secrets belong only in server configuration.

### Spending, recovery and operations

- Analysis and confidence have planned allowances shown before approval. An estimate is not a billing guarantee; cancelled in-flight requests may still be charged.
- Paid steps are not retried automatically. Saved results and reservations prevent ordinary replay from duplicating completed paid work.
- Hosted jobs store recovery records in private Supabase Storage; local recovery uses `.analysis-jobs/`. Resuming requires compatible source/build/plan identity and the relevant cost approval.
- Confidence can process up to two findings concurrently, subject to server admission limits. There is no guaranteed completion time.
- Request IDs, structured server events, rate limits and concurrency admission support diagnosis and overload control. Keep testimony, credentials and source dumps out of logs.
- [`vercel.json`](vercel.json) requests a 300-second function limit and configures a daily health cron. Actual execution remains subject to the hosting account’s supported limits. Health checks do not call the model.

## Development checks

```sh
npm test        # Offline suite; mocked model calls, no provider charges
npm run lint
npm run build
```

Some offline integration tests bind a temporary loopback server and need local binding permission. A denied binding is a failed check, not a passing test. Test counts change as coverage grows; use the current run’s output.

Live model evaluations are separate from `npm test` and require explicit spending approval. Offline tests verify code behavior; they do not establish real-world detection accuracy or calibrated confidence.

## Limits to understand

- The system can miss contradictions. Confidence checks assess existing findings; they do not recover undiscovered ones.
- Fresh model responses can vary, and repeated checks can make correlated errors.
- Hypotheticals, uncertain recollections and unclear occasions still need human judgment. A high support score is not a legal finding.
- Scanned PDFs need OCR; check extracted text and page coverage before analysis. PDF reading order can affect source parsing.
- Large documents can create many comparisons, higher costs and longer waits. Incomplete or rejected work must not be interpreted as “no contradictions.”
- Approved lessons improve available context, not model weights. More stored corrections do not guarantee better accuracy.

## Repository guide

| Path | Contents |
| --- | --- |
| [`src/`](src/) | Workspace, upload/source review, confidence UI, Settings and PDF export |
| [`server/documentAnalysis.js`](server/documentAnalysis.js) | Comparison planning and execution |
| [`server/typeDecision.js`](server/typeDecision.js) | Shared category rules |
| [`server/confidence/`](server/confidence/) | Confidence planning, reservations and model checks |
| [`shared/hybridConfidence.js`](shared/hybridConfidence.js) | Versioned confidence arithmetic and result validation |
| [`server/scoring/`](server/scoring/) | Deterministic evidence rules |
| [`server/memory/`](server/memory/) | Approved-lesson retrieval |
| [`server/cloudAnalysis.js`](server/cloudAnalysis.js) | Hosted job execution |
| [`supabase/migrations/`](supabase/migrations/) | Database, authorization and storage migrations |
| [`docs/`](docs/) | Feature notes and operational context; older notes may describe prior designs |
| [`public/examples/`](public/examples/) | Fictional practice inputs and expected-results guide |

Keep private transcripts, credentials, local recovery data and author/verifier artifacts out of public commits. Evaluation answer keys must remain separate from production prompts.
