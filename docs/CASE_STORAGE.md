# Saved case work

The cases table requires transcript1 and transcript2 (text, default empty string), results (nullable jsonb), and review_notes (jsonb, default {}). Authenticated users need column-level UPDATE grants on these four fields and an owner-only UPDATE RLS policy, in addition to the existing SELECT and INSERT policies.

Choose a saved case, paste or import text, and click Save case. Reopen the case after a refresh to retrieve saved work. The sample is temporary until you click Save sample as case.

Analyze saves both input transcripts before contacting the analysis endpoint. If saving fails, analysis does not start. Successful results are saved afterward. If that save fails, results remain on screen with a retry message. Save case also saves review notes and reviewed marks. Editing transcripts clears stale results; click Save case to persist those edits. Unsaved work triggers the browser navigation warning. Unsaved drafts remain available when switching cases in the same tab.

results stores { findings, elapsedSeconds }. review_notes stores { notes, reviewed }. Loading also accepts an older results array. Case lists fetch only case metadata; full work loads when opening a case. Updates send only the four supported fields, and require a returned row before claiming success.

Original uploaded file objects and filenames are not stored; transcript text is stored. Saving is explicit except at the start and successful end of analysis. Browser closure during an analysis does not resume that analysis automatically. Multiple-tab conflict resolution is not implemented; the last successful save wins.

Verification: node --test src/lib/caseStore.test.js server/scoring/scoring.test.js server/sourceEvidence.test.js server/comparisonRules.test.js
