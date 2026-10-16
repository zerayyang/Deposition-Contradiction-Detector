# Simpler speaker confirmation

The source scanner previously treated broad honorific-prefixed strings, including
PDF timestamps, as speaker names. Document captions and staff labels also appeared
in the mandatory role list. This was excessive work and could split real testimony.

The scanner now recognizes fixed document-caption patterns, spaced caption letters,
examination bylines and explicit court/support staff as non-witness boundaries.
They do not need individual human role assignment and cannot be assigned WITNESS.
Honorific names use a bounded name grammar; addressed-person sentences, questions,
commas and timecode digits do not pass as names. Actual unfamiliar name-like labels
remain unresolved, never automatically promoted into witnesses. Original offsets
and every source character remain unchanged.

The UI now asks for the witness and questioner per transcript, with one explicit
Confirm speakers action. Existing A/THE WITNESS and Q syntax can be selected without
assigning each lawyer individually. The confirmation explains that all remaining
named turns become OTHER. No named witness is guessed. Advanced individual roles
remain available for multiple witnesses/questioners or corrections. Confirmation
changes local request metadata only; it does not rewrite source documents or labels.

Independent fictional regressions: court/document headings stay outside witness
speech; honorific prose/timecodes stay within their original answer; genuine
unreviewed names remain bounded; unknown named witnesses require a choice;
unlisted choices and conflicting roles are rejected; explicit confirmation yields
only the selected witness/questioner maps and leaves inputs unchanged. Run:

```sh
node --test server/speakerCleanup.test.js src/lib/speakerReview.test.js
```

Five targeted tests and 380 broad local regressions passed. Production build and
changed-file lint passed. This is UI/source handling, not a change to classification
or deterministic confidence formulas. No gold labels, author files, feedback lessons
or saved testimony were changed by these checks.

Browser check used the existing saved Trump case on localhost without starting paid
analysis or saving/replacing its existing findings. The free event-reading preview
reported 49 requests, exceeding the configured 12-request cap. Do not silently raise
that cap, switch to direct comparison, omit sections, or call a focused excerpt test
a complete-document review. Full event comparison count/cost is unknown until reading.
Hosted Vercel deployment still needs the code update before it has this simpler UI.
