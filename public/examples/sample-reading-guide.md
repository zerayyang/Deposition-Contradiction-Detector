# Riley Morgan: test files and expected results

These depositions are fictional. This is a manual test guide, not an observed AI output or a calibrated accuracy benchmark. The examples and expected answers are not added to the AI prompt.

## Run the test

1. Create a saved case (for example, Riley Morgan PDF test).
2. Upload riley-morgan-first-deposition.pdf as Transcript 1.
3. Upload riley-morgan-second-deposition.pdf as Transcript 2.
4. Text should appear automatically. Check that each transcript has six Q: and six A: entries. Hide text should collapse it; Show text should restore it. A replacement upload should show its new extracted text automatically.
5. Click Analyze transcripts, then compare the findings with the table below.
6. Refresh and reopen the saved case. Both transcript texts, original filenames and saved findings should return. Open original should open the corresponding PDF.

## Expected reasoning

| Issue | First account | Second account | Expected category and reason |
| --- | --- | --- | --- |
| Leaving home | At home all evening; did not leave at any point. | Left at 7:30 and returned at 8:00 that evening. | DIRECT: opposite claims about leaving home during the same evening. |
| Invoice count | Exactly three invoices on October 12, 2025. | Exactly five invoices on the same day, referring to the same set. | DIRECT: incompatible exact counts. |
| Prior awareness of Elena Ruiz | Never heard of Elena before October 12, 2025. | Knew of Elena through mutual friends in 2024. | DIRECT: awareness is explicitly anchored before the cutoff. Whether they met face to face is a separate fact and does not erase this conflict. |
| Depot building versus street | Never inside the Northgate depot building. | Drove along the street but never entered the building. | FALSE_POSITIVE: being nearby is compatible with never entering the building. |
| Speaking versus waving | Did not speak to anyone that evening. | Waved to a neighbor without speaking. | FALSE_POSITIVE for speaking: both can be true. The departure also supports the leaving-home finding; do not count that same conflict a second time. |
| Package and call order | Package arrived before the call with Sam Lee. | Call ran 7:40-7:50; package arrived at 8:10. | INFERENTIAL target: the times put the package after the call, opposing the earlier sequence. DIRECT is also defensible if the classifier's definition treats necessary time ordering as explicit; explain the basis rather than invent another issue. |

The target is four distinct conflicting issues and two compatible comparisons. The number of cards may vary if compatible comparisons are omitted; repeated versions of the same conflict should not inflate the findings count.

## Code confidence check

The independent code engine may return Not evaluable for a conflict outside its supported rules. That is different from classifying a pair as compatible. No exact numeric score is prescribed by this guide: weights, extracted fields and supported patterns affect it.

## Expected failure handling

- Image-only or blank PDF page: explain that OCR is needed; do not silently skip it or replace the old transcript.
- Password-protected PDF: ask for an unlocked copy.
- Invalid PDF or unsupported format: show an actionable error.
- File over 2 MB: reject it before uploading.
- Storage/save failure: keep previous case contents and offer a retry through Upload or Replace file.
