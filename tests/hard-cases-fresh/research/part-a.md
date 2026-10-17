# Author research audit — part A

Isolated author operation; no detector/app/model APIs, paid calls, verifier output, production prompts, approved labels, other corpora, or Git mutations used. Only explicit exclusion metadata and public opinions were consulted.

11 proposed heldout rows: 6 DIRECT, 5 FALSE_POSITIVE, from 8 opinions. No opinion contributes more than two rows. No INFERENTIAL/DEBATABLE rows were forced to fill quota. Exclusions checked by URL, caption and docket, including known aliases.

The paired excerpts and reconstructed questions are in part-a.json. All reconstructed questions are marked and use court-stated context; no ruling or label enters a transcript. Judicial editorial bracket characters/words and ellipses remain in quoted witness fragments.

Sources 01, 02 and 07 are fresh web.run extracts from HTML reproductions of the court opinion, including the relevant passages and opinion page markers. Their sourceSha256 values hash the UTF-8 text snapshot, not inaccessible original PDF bytes. Direct Justia PDF downloads returned 403. Sources 03, 04, 05, 06 and 08 are direct PyMuPDF relevant-page extractions; the original downloaded PDF hash and URL are recorded separately. No complete unnecessary opinions are saved in the research folder.

Both excerpts manually compared with reopened opinions. The fixed shared evidenceTokens/shingleCoverage helper was applied, retaining bracketed words and stripping bracket characters/ellipsis formatting. Every quote passes the 0.90 coverage threshold. Original quoted Q/A words are preserved, with only whitespace reflow; paragraph fragments are explicitly contextualized through marked reconstructed questions.

Cautions for human heldout review:
- Row005 addresses the repeated broken remark, while row004 addresses the separately adjudicated age contradiction. The same declaration sentence is retained whole, and the two deposition contexts differ.
- Row006 follows the court’s express contradiction finding; its deposition answer disclaims recalling additional personal notice while referring to a manager/form. Full later six-item notice statement is retained.
- Row008 distinguishes surgical suitability from medical indication, as the opinion expressly does. Its answer fragments retain the opinion’s omissions.
- Row009 follows the court’s express flat-contradiction characterization of memory disclaimer versus later categorical conduct denial.
- Row011 pairs the deposition in this action with the declaration, not the separately discussed statutory pre-suit hearing.

Rejected research leads and concrete reasons are retained in part-a-dropped.json. No draft is human-approved or promoted to gold. No accuracy/calibration claim is made.

| ID | Source capture | Opinion pages: quote1 / quote2 / ruling | Coverage 1 / 2 |
|---|---|---|---|
| fresh-a-001 | research/sources-a/a-source-01.txt | 19 / 19 / 19 | 1.000 / 1.000 |
| fresh-a-002 | research/sources-a/a-source-01.txt | 19 / 19 / 19 | 1.000 / 1.000 |
| fresh-a-003 | research/sources-a/a-source-03.txt | 30 / 30 / 31 | 1.000 / 1.000 |
| fresh-a-004 | research/sources-a/a-source-04.txt | 23 / 23 / 23 | 1.000 / 1.000 |
| fresh-a-005 | research/sources-a/a-source-04.txt | 25 / 23 / 28 | 1.000 / 1.000 |
| fresh-a-006 | research/sources-a/a-source-05.txt | 28 / 28 / 28 | 1.000 / 1.000 |
| fresh-a-007 | research/sources-a/a-source-06.txt | 37 / 37 / 37 | 1.000 / 1.000 |
| fresh-a-008 | research/sources-a/a-source-06.txt | 38 / 38 / 38 | 1.000 / 1.000 |
| fresh-a-009 | research/sources-a/a-source-08.txt | 2 / 2 / 2 | 1.000 / 1.000 |
| fresh-a-010 | research/sources-a/a-source-02.txt | 12 / 12 / 14 | 1.000 / 1.000 |
| fresh-a-011 | research/sources-a/a-source-07.txt | 13 / 13 / 13 | 1.000 / 1.000 |
