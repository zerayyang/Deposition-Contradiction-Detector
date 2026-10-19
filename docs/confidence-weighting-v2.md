# Hybrid weighting v2 and demo

New server-created confidence plans store `fixed-weight-v2`. Legacy plans/results keep `fixed-weight-v1`; no saved score is silently recalculated.

For all available components:
`score = round(60 × A + 30 × R + 10 × C)`

- A: fraction of six valid model reads agreeing with the original category.
- R: 1 for independent reviewer agreement, 0.5 for agreement with concerns, 0 for disagreement.
- C: deterministic category-aligned rule support, 0–1. Code contributes at most 10 points.
- If no code rule applies, C is unknown: `round(100 × (60 × A + 30 × R) / 90)`.
- Failed exact-source checks or missing/invalid required model reads still yield no score.

Examples: 5/6 agreement, reviewer agrees, full code support = 50+30+10 = 90. With reviewer concerns, 50+15+10 = 75. Two agreeing reads, dissenting reviewer and unsupported code = round(20/90×100) = 22. The old policy produces 25 for that last case; lower code weight does not promise higher results.

These fixed weights are experimental and not fitted accuracy calibration. Human notes do not automatically add points. Existing statistical-calibration arithmetic and evidence scoring rules are unchanged. Live provider choices/labeling and discovery are unchanged.

`public/hybrid-confidence-demo.html` is a self-contained fictional interactive example with the same v2 arithmetic and a source-failure gate; no model/network calls. Tests compare 168 input combinations with production and exercise the default, low-support, reset and invalid-source controls.

Run `node --test tests/confidence/weighting-v2.test.mjs tests/confidence/demo-weighting.test.mjs tests/confidence/hybrid.test.mjs tests/confidence/client.test.mjs`.

Display language: below50 Low confidence;50–74 Not sure;75–89 Confident;90–100 Very confident. Reviewer dissent prevents a Confident/Very confident label. These are chosen UI ranges, not empirically validated accuracy bands. Missing/failed checks retain their explicit states and no percentage. Stored status stays EXPERIMENTAL; labels never change the score or evidence gate. See tests/confidence/labels.test.mjs.
