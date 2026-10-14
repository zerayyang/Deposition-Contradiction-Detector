# Original transcript files

Apply supabase/migrations/20261013_private_originals.sql in the Supabase SQL Editor. It creates the private case-originals bucket and owner-scoped policies. Existing case SELECT, INSERT, UPDATE and DELETE policies still apply. This migration does not change them.

Each object uses user-id/case-id/random-id.txt (or .md). The real filename, type, size and private path are saved under review_notes.documents in the existing cases row. No extra case columns are required. Upload uses the original File bytes; parsing only produces the editable transcript. Editing a transcript does not rewrite its uploaded original.

Save the sample as a real case first. Upload .pdf, .txt or .md files up to 2 MB. Also apply supabase/migrations/20261013_pdf_originals.sql to allow application/pdf in the existing private bucket. Upload and the case update must both succeed before the document card changes. If the case update fails, the newly uploaded object is removed where possible and previous case contents stay intact. Replacing a file removes its previous original only after the new reference is saved. Interrupted operations can leave unreferenced private objects; cleanup is best effort and needs a future background job for guaranteed recovery.

Open original performs an authenticated private download into a temporary browser Blob URL. It does not create a public URL. Browser sessions can retain already downloaded content. PDF.js extracts selectable PDF text locally in the browser using a bundled worker. Scanned or blank pages require OCR before import; password-protected or invalid files are rejected. Limit: 200 pages and 500,000 extracted characters. Preview before analyzing because PDF reading order can vary. Fictional fixtures are in public/examples and linked from the workspace.

Deleting a case removes the case row, then attempts storage cleanup under that case folder. A cleanup failure is reported separately; the deleted case is not falsely shown as retained. Failed cleanup requires manual Storage cleanup until background retries are added.

Verification: node --test src/lib/documentStore.test.js src/lib/caseStore.test.js
Live two-account isolation, original-byte equality and refresh testing still need verification against the configured Supabase project.
