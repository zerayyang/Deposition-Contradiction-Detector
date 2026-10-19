# Bare Q/A confidence regression

All fixtures in `tests/confidence/bare-qa.test.mjs` are fictional and contain no real testimony.
Expected results are parser/source behavior, not classification gold or confidence calibration.

- Uppercase bare Q and its uninterrupted bare A are recognized without line numbers.
- Punctuated, numbered and mixed formats retain their original offsets and governing question.
- Named lawyer/courtroom turns and Source metadata remain outside witness answers.
- A standalone prose line beginning with A is not a witness marker. A named/metadata interruption prevents a later bare A inheriting the question frame.
- Exact quotation verification remains required. A lawyer quote cannot be used for confidence.
- Free allowance preparation and exact-source planning succeed for the synthetic pair without model calls.
- Unstructured input, missing witness answers and oversized context return distinct safe errors and recovery instructions. Storage errors remain generic and never echo payloads.

Run `node --test tests/confidence/bare-qa.test.mjs tests/confidence/handlers.test.mjs`.
These offline tests do not establish live model accuracy or repair previously saved missing citations.
