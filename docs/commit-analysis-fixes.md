# Commit the tested analysis fixes

These are suggested commands only. No files have been staged or committed by the agent. Inspect the complete staged diff before committing; existing staged work, if any, is part of that commit too.

The selection includes the earlier uncommitted hosted adapter dependencies plus the current repairs. It excludes private testimony, reports, author drafts/reviews, credentials and the unrelated AGENTS.md edit. No package dependency was added.

```bash
cd '/Users/zerayyang/Desktop/Deposition Contradiction '
git add -- \
  .gitignore \
  server/analysisHandlers.js \
  server/app.js \
  server/configuration.js \
  server/documentAnalysis.js \
  server/directOutput.js \
  server/cloudAnalysis.js \
  server/cloudJobStore.js \
  server/events/compare.js \
  server/events/extract.js \
  server/events/scoringAdapter.js \
  server/events/validate.js \
  server/events/workflow.js \
  server/events/EXTRACTION_PROMPT.md \
  server/pdfReporting.js \
  server/pdfReporting.test.js \
  server/pdfQuoteGrounding.js \
  server/testimonyMarkers.js \
  server/testimonySource.js \
  server/server.js \
  src/App.jsx \
  src/EventReview.jsx \
  src/RecoveryPanel.jsx \
  src/lib/analysisClient.js \
  src/lib/cloudAnalysisClient.js \
  vercel.json \
  tests/deployment/vercel.test.mjs \
  tests/deployment/cloud-jobs.test.mjs \
  tests/deployment/cloud-storage.test.mjs \
  tests/deployment/CLOUD_EXPECTED_RESULTS.md \
  tests/deployment/UI_CHECK_EXPECTATIONS.md \
  tests/events/extract.test.mjs \
  tests/events/EXPECTED_RESULTS.md \
  tests/long-documents/direct-output.test.mjs \
  tests/long-documents/RECOVERY.md \
  docs/hosted-analysis-steps.md \
  docs/analysis-reliability-fixes.md \
  docs/commit-analysis-fixes.md
git --no-pager diff --cached --stat
git --no-pager diff --cached
git commit -m "Fix hosted analysis resume, source grounding and output limits"
```

Production was deployed directly through the authenticated Vercel CLI. Committing these related files preserves the repair in Git; these commands do not push or redeploy.
