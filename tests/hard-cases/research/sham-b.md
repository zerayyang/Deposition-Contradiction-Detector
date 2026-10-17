# Sham-affidavit research B — draft, not approved

29 proposed pairs from 18 judicial opinions. Labels: 14 FALSE_POSITIVE, 14 DIRECT, 1 DEBATABLE. No INFERENTIAL labels. All splits remain null.

Only the two assigned research files were authored. No app implementation, gold corpus, detector output, verifier reports, paid calls, prompts, scoring changes, approval workflow, or Git mutations were used. Existing author-tool file presence and author prompt were checked. This research corpus is not an approved Level 2 bundle or verifier handoff.

## Evidence policy

Each detector transcript contains witness evidence only. Original examiner questions stay Q and witness answers stay A. Later affidavit statements are presented under a neutral reconstructed question, explicitly flagged per record. Fragments are retained as fragments with court brackets; they are never rewritten as fabricated complete answers. Judicial analysis remains in provenance/labelBasis.

The public-domain basis applies to the court-authored judicial opinion under the government-edicts doctrine, including its reproduced evidentiary passages; it does not assert that publisher editorial matter or attorney covering briefs have a free license. American Rena uses the attached court order only, not the TTAB filing author’s descriptions.

Quotes were compared to public opinion text. Seven PDF sources were independently fetched and their byte hashes retained per record. Automated substring checks use whitespace-only normalization and are recorded honestly, including false/null results. PDF page headers, footers and line numbers can interrupt literal substrings. Gattineri and ConAgra relevant PDF pages were also rendered locally for visual checking. Source files/renders remain temporary, not dumped into the repo. The quote-pair hashes identify proposed evidence text and are not substitutes for source verification.

## Limits requiring review

- Fata’s official HTML has legacy encoding artifacts; typographic punctuation has been transcribed, and an original-page check remains necessary before approval.
- Shelcusky’s Justia court-text extraction omits some apostrophes; the literal extracted don t is preserved. Accurate HTML section/block locators are used rather than guessed reporter pages. Majority and dissent are distinguished.
- Ruple paragraph 5 is DEBATABLE: furnishing a written notice and having written knowledge before execution are not strict logical negations, despite exclusion. Paragraph 4 follows the court’s contradiction assessment but seeking an increase versus binding approval needs careful scope review.
- Gattineri innocence-condition and Daniels overheard-epithet are DIRECT even though the affidavits were admitted: the courts expressly recognized contradiction but accepted explanation/corroboration. Sham admissibility is not the same label as contradiction.
- Willard is a magistrate memorandum and recommendation. No claim is made that a final district-judge adoption was independently checked.
- Cole’s affidavit fragment is reproduced by the opinion in third person; it is not silently converted to first person.
- Several opinion passages are quoted fragments, with context in provenance; full original depositions and declarations were not obtained. No UTF-16 offsets into original testimony are claimed.
- The result is intentionally not 50/50 balanced: 14 FALSE_POSITIVE, 14 DIRECT, 1 DEBATABLE, selected for exact evidence rather than synthetic balancing. Same-opinion groups must remain together in any eventual split; the two separately ruled Gattineri call events are related and must not be treated as independent source diversity.

## Sources and pinpoint coverage

- [Gattineri v. Wynn MA, LLC, No. 18-11229-FDS, Doc. 167 (Jan. 13, 2022)](https://www.govinfo.gov/content/pkg/USCOURTS-mad-1_18-cv-11229/pdf/USCOURTS-mad-1_18-cv-11229-1.pdf) — 7 pair(s).
  - `hard-sham-b-gattineri-role`: quote 1 4 (Dep. I:297); quote 2 3–4 (Aff. ¶11(a)); ruling 4.
  - `hard-sham-b-gattineri-price`: quote 1 5–6 (Dep. I:302–03); quote 2 5 (Aff. ¶11(a)); ruling 6–7.
  - `hard-sham-b-gattineri-april15-call`: quote 1 7 (Dep. I:304); quote 2 7 (Aff. ¶11(b)); ruling 7.
  - `hard-sham-b-gattineri-april17-call`: quote 1 7–8 (Dep. I:305); quote 2 7 (Aff. ¶11(c)); ruling 8.
  - `hard-sham-b-gattineri-threats`: quote 1 9 (Dep. I:95); quote 2 8 (Aff. ¶11(g)); ruling 9–10.
  - `hard-sham-b-gattineri-innocence-condition`: quote 1 12 (Dep. I:89–92); quote 2 10 (Aff. ¶22); ruling 12–13.
  - `hard-sham-b-gattineri-krum-conversation`: quote 1 13–14 (Dep. I:20–21); quote 2 13 (Aff. ¶26); ruling 14.
- [In re ConAgra Foods, Inc., No. CV 11-05379 MMM (AGRx), Doc. 545 (Feb. 23, 2015)](https://truthinadvertising.org/wp-content/uploads/2014/08/Ir-Re-Conagra-Foods-order-granting-part-of-class-cert-motion.pdf) — 3 pair(s).
  - `hard-sham-b-conagra-briseno-gmo-preference`: quote 1 38 n.137 (Dep. 100:8–101:14); quote 2 38–39 (Decl. ¶5); ruling 38–39.
  - `hard-sham-b-conagra-crouch-future-purchase`: quote 1 39–40 (Dep. 180:19–24); quote 2 40 (Decl. future-purchase passage); ruling 40–41.
  - `hard-sham-b-conagra-towey-food-choice`: quote 1 41 n.143 (Dep. 61:2–7); quote 2 41 (Decl. ¶¶6,8); ruling 41–42.
- [Ruple Builders, Inc. v. Brackenridge Construction Co., No. 2:17-cv-00004, Doc. 63 (2019)](https://law.justia.com/cases/federal/district-courts/pennsylvania/pawdce/2:2017cv00004/235232/63/) — 2 pair(s).
  - `hard-sham-b-ruple-change-orders`: quote 1 5 (Dep. 46:11–47:4); quote 2 5 (Decl. ¶4); ruling 6–7.
  - `hard-sham-b-ruple-written-knowledge`: quote 1 7 (Dep. 29:11–23); quote 2 7 (Decl. ¶5); ruling 8–9.
- [Hamilton v. Coffee Health Group, No. CV-10-S-3621-NW, Doc. 58 (June 6, 2013)](https://law.justia.com/cases/federal/district-courts/alabama/alndce/3:2010cv03621/134620/58/) — 1 pair(s).
  - `hard-sham-b-hamilton-racist-comments`: quote 1 6 (Dep. II:413–14); quote 2 6 (Decl. ¶3); ruling 7.
- [Thomas v. Bronco Oilfield Services, No. 2:16-cv-01557-MRH, Doc. 130 (Nov. 30, 2020)](https://www.govinfo.gov/content/pkg/USCOURTS-pawd-2_16-cv-01557/pdf/USCOURTS-pawd-2_16-cv-01557-0.pdf) — 1 pair(s).
  - `hard-sham-b-thomas-work-environment`: quote 1 6 n.7 (Dep. 57:25–58:5); quote 2 6 n.7 (Decl. pp.3–4); ruling 6–7 n.7.
- [Fata v. School District of Horicon, No. 2006AP234 (Dec. 21, 2006)](https://www.wicourts.gov/ca/opinion/DisplayDocument.html?content=html&seqNo=27535) — 1 pair(s).
  - `hard-sham-b-fata-pad-binding`: quote 1 ¶6; quote 2 ¶6; ruling ¶¶8–13.
- [Shelcusky v. Garjulio, 172 N.J. 185 (2002)](https://law.justia.com/cases/new-jersey/supreme-court/2002/a-52-01-opn.html) — 1 pair(s).
  - `hard-sham-b-shelcusky-boxes-versus-general-knowledge`: quote 1 HTML opinion Part I, deposition block beginning And, again, do you know what kind of product; quote 2 HTML opinion Part I, second reconsideration certification block; ruling HTML opinion Part III, paragraphs beginning Applying those principles and A comparison.
- [Willard v. Friendswood ISD, No. 3:18-CV-00233, Doc. 39, Memorandum and Recommendation (Dec. 12, 2019)](https://www.govinfo.gov/content/pkg/USCOURTS-txsd-3_18-cv-00233/pdf/USCOURTS-txsd-3_18-cv-00233-2.pdf) — 1 pair(s).
  - `hard-sham-b-willard-compelled-resignation`: quote 1 10 (Dep. Dkt.29-1 p.26); quote 2 10 n.2 (Decl. Dkt.32-2 p.3); ruling 10 n.2.
- [American Rena International Corp. v. Sis-Joyce International Co., No. CV 12-6972 FMO (JEMx), Doc. 284 (Dec. 14, 2015)](https://ttabvue.uspto.gov/ttabvue/ttabvue-92058196-CAN-11.pdf) — 1 pair(s).
  - `hard-sham-b-american-rena-drafting`: quote 1 opinion p.19, PDF p.24 (Dep. Oct.2013 p.281); quote 2 opinion p.11, PDF p.16 (Decl. ¶29); ruling opinion p.11, PDF p.16.
- [Daniels v. Texas Department of Transportation, No. 4:15-CV-00702-CAN, Doc. 62 (Dec. 10, 2016)](https://law.justia.com/cases/federal/district-courts/texas/txedce/4:2015cv00702/163282/62/) — 3 pair(s).
  - `hard-sham-b-daniels-additional-speakers`: quote 1 13 (Dep. 159:5–12 as printed); quote 2 13 (Sworn Statement ¶6, p.2); ruling 14–15.
  - `hard-sham-b-daniels-hearing-epithet`: quote 1 13 (Dep. 159:13–20 as printed); quote 2 13 (Sworn Statement ¶31, p.8); ruling 15–16.
  - `hard-sham-b-daniels-physical-limitations`: quote 1 13–14 (Dep. 111:11–112:11); quote 2 13 (Sworn Statement ¶26, p.7); ruling 14–15.
- [Cole v. CVS Pharmacy, Inc., No. 1:19-cv-01384-JLT-EPG, Doc. 20 (July 14, 2022)](https://law.justia.com/cases/federal/district-courts/california/caedce/1:2019cv01384/362315/20/) — 1 pair(s).
  - `hard-sham-b-cole-wet-substance`: quote 1 5 (Dep. Dkt.11-3 p.11 lines18–19); quote 2 6 (Aff. Dkt.13-3 pp.2–3 ¶7); ruling 6–8.

## Exclusions / research dead ends

- Maisha, Kennett-Murray, Lane, Tippens, Van T. Junkins, Cleveland, Aerel and O’Brien were reserved to the other author and not used.
- Baer v. Chase: useful doctrine/corroboration, but the located opinion paraphrases the operative later certification rather than supplying a full paired passage suitable for this strict batch.
- Yeager v. Bowlin: the located opinions describe many non-recollections and later assertions without printing the needed pair-specific exact affidavit language. No pairs fabricated from the global summary.
- Burns v. Board of County Commissioners: concerns deposition errata; not used to substitute errata for the requested later affidavit/declaration pairs.
- Gilani (E.D.N.Y. 04-cv-2935): affidavit language available, but the key deposition side in the located ruling was paraphrased; excluded.
- Orio v. DAL Global Services: useful individually resolved issues, but the relevant later statements and portions of the earlier testimony were paraphrased in the located opinion; excluded from strict pairs.
- Wilburn insurance permission opinion: search result located a deposition/ruling, but accessible full paired affidavit text could not be confirmed; excluded.
- Lilani v. Noorali: exact affidavit wording but paraphrased deposition in the located passage; excluded.
- France v. Lucas: prior quoted account was trial testimony, not the requested deposition side; not used to inflate this deposition/affidavit collection.
- ConAgra interrogatory-versus-future-purchase examples were excluded because the first side was not deposition testimony.

No corpus record is approved automatically. Next step: human source/label review, resolve flagged extraction limitations, then decide whether to import approved candidates through the project’s supported author workflow.


## Additional public-source research batch

Three pairs added from three new opinions; no existing cases relabeled or removed.

- [Mansoori v. Brown, No. 17-cv-8846, Doc. 253 (Feb. 19, 2026)](https://law.justia.com/cases/federal/district-courts/illinois/ilndce/1:2017cv08846/347101/253/) — `hard-sham-b-mansoori-mental-health-treatment` (DIRECT); quote 1: 10 n.4 (Dep. Dkt.231-5 pp.20–21); quote 2: 10 n.4 (Decl. Dkt.251 ¶8); ruling: 10 n.4.
- [U.S. EEOC v. Ecology Services, Inc., No. ELH-18-1065, Memorandum Opinion (Mar. 19, 2020)](https://www2.mdd.uscourts.gov/Opinions/Opinions/18-cv-1065%20EEOC%20v.%20Ecology%20Servs%20Inc.%20MSJ%20v.%20Final.pdf) — `hard-sham-b-ecology-voicemail-content` (FALSE_POSITIVE); quote 1: 30 (Dep. ECF57-1 p.10); quote 2: 11 (Decl. ECF51-11 ¶9); ruling: 30.
- [Walter v. Bullock / JPS Aviation, LLC, No. 15-1938, Doc. 43 (Jan. 10, 2017)](https://cases.justia.com/federal/district-courts/louisiana/lawdce/3%3A2015cv01938/147301/43/0.pdf) — `hard-sham-b-walter-right-to-sue-recollection` (DIRECT); quote 1: 7 (Dep. Apr.22,2016 pp.134–135, Record Docs17-4,19-5); quote 2: 7 (Aff. June8,2016, Record Doc23); ruling: 8–9.

Mansoori and Walter were checked against publicly indexed opinion passages; direct PDF retrieval failed, so no visual-page or byte-hash verification is claimed. Both remain draft with this limitation. Ecology was independently fetched from the issuing court and includes byte hash and positive whitespace-only substring checks for both quotes. Its cited declaration paragraph differs between the full quote and later shortened discussion; the record explicitly preserves that discrepancy.

Scanlan v. Adams Manufacturing, Doc.157 (Feb.24,2026), was researched but not added: its located declaration quotations are fragments whose subjects largely sit in surrounding judicial paraphrase. Setchfield v. St.Charles County, Doc.69 (May5,2023), was not added because the later-affidavit side of the relevant pair-specific discussions was paraphrased. No near-duplicate earnings fragments were added merely to meet a count.

## Final four DIRECT additions and source limits

- [Bauer v. The Travelers Home and Marine Insurance Company, No. 3:15-CV-348-CLS, Doc. 75 (Jan. 20, 2017)](https://law.justia.com/cases/federal/district-courts/alabama/alndce/3:2015cv00348/154439/75/) — `hard-sham-b-bauer-rental-agreement`; quote 1 5 (Deposition of Rosalee Stella Bauer pp.45–46, Doc.55-5); quote 2 4 (Affidavit of Rose Bauer p.9, Doc.61-1); ruling 6.
- [Hill-Satterfield v. Lauderdale, No. 3:24-CV-249-TAV-DCP, Doc.63 (Dec.19,2025)](https://docs.justia.com/cases/federal/district-courts/tennessee/tnedce/3:2024cv00249/114825/63) — `hard-sham-b-satterfield-repudiation-understanding`; quote 1 11 (Deposition Doc.42 pp.17–18); quote 2 11 (Declaration Doc.51-1 p.3); ruling 11–13.
- [David v. Betts, No.20-00002 JMS-WRP, Order (May15,2024), footnote24](https://caselaw.findlaw.com/court/us-dis-crt-d-haw/116187917.html) — `hard-sham-b-david-tro-idea`; quote 1 HTML opinion footnote24 (June7,2023 deposition, ECF395-2 PageID.3814); quote 2 HTML opinion footnote24 (Nov.13,2023 declaration, ECF378-1 PageID.3602); ruling HTML opinion footnote24.
- [Smith v. Caesars Baltimore Management Company, L.L.C., No.ELH-17-3014, Doc.45 (Aug.9,2019)](https://www.govinfo.gov/content/pkg/USCOURTS-mdd-1_17-cv-03014/pdf/USCOURTS-mdd-1_17-cv-03014-0.pdf) — `hard-sham-b-smith-facebook-conversation`; quote 1 18 (June28,2018 deposition, ECF43-1 pp.4:18–5:3); quote 2 18 (Oct.1,2018 declaration, ECF40-1 ¶20); ruling 18.

All four have exact public-opinion quotations and explicit pair-specific rulings. Bauer and Satterfield use the printed page numbers preserved by the public opinion mirror. David uses the exact HTML footnote24 plus underlying testimony PageIDs; an opinion PDF page number was not available and is not invented. Smith was checked against the rendered official PDF page18 and retains its source-byte hash. Full underlying testimony was not obtained. Source locators are present for both quotes and each ruling in every record.

Fata is held out of assembly pending original-source punctuation confirmation; its research label is retained without approval. Crawford training was excluded as a factual-pair duplicate of the other author’s row. S.W.S. Erectors was not forced into DIRECT because its conditional-versus-unconditional scope needs further scrutiny. No further expansion was undertaken after the final four. These remain draft proposals, not approved cases.
