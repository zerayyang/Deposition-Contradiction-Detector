# Same-time location verification: test inputs and expectations

This guide accompanies `locations.test.js`. These fictional inputs exercise the independent code rules, not a live Claude call. Claude's classification is preserved. Changing DIRECT to INFERENTIAL or FALSE_POSITIVE must not change the code score.

## Copy/paste example

Transcript 1:

```text
i saw nathan at the corner store on september 11 at 11 am
```

Transcript 2:

```text
i saw nathan at the gym on september 11 at 11 am
```

Intended interpretation: DIRECT under the ordinary reading that the store and gym describe separate venues for the same sighting. The code should return CONFLICT_SUPPORTED with a `point-location` rule and an explicit co-location limitation. This checks conflicting location accounts; it does not establish dishonesty or geographic impossibility.

## Intended behavior (separate from observed results)

| Change to the pair | Intended code behavior | Reason / interpretation |
| --- | --- | --- |
| Exact pair above | CONFLICT_SUPPORTED | Same named subject, source date and exact clock, different supported venue families. |
| Maya Patel, library vs hospital, October 4th/October 4, 2:15 pm/14:15 | CONFLICT_SUPPORTED | General name handling and normalized ordinal dates / clocks. |
| Witness says “I was at the office” vs “I was at the warehouse,” Monday at noon | CONFLICT_SUPPORTED | Same witness's directly asserted presence. |
| Same venue on both sides | COMPATIBLE_SUPPORTED | Matching location descriptions; false positive for an alleged clash. Separate compatibility index, not a contradiction score. |
| Different person, day, year, or clock | No location score | These may describe separate people or visits. Different clock values alone must not turn repeated sightings into one conflicting event. |
| “Around 11 am” vs “11 am” | No location score | Approximation does not establish simultaneous presence at two venues. |
| Missing date or unresolved AM/PM | No location score | Insufficient temporal context. |
| Store inside gym, gym near store, multiple venues | No location score | Cannot establish distinct venue identity from these relations. |
| Gym vs fitness center; store vs corner store | No location score | Different names in one venue family may be aliases. |
| Reported speech, negated or hypothetical source | No location score | A cropped excerpt cannot turn these into affirmative first-person testimony. |
| Extracted phrase absent from quote, or quote only in question | UNVERIFIED_SOURCE, no score | Exact witness-source validation remains mandatory. |
| Repeated quote without a unique source anchor | No score | Cannot select the relevant source sentence/question safely. |
| “I think I saw ...” | Conflict support with lower commitment | Assertion hedge lowers the current heuristic score. Cropping it from the model quote must not remove that penalty. |

“No location score” means this rule abstains. Other independently supported rules may still establish a result for richer testimony; the negative fixtures here contain no such other evidence.

## How to run

From the repository root:

```sh
node --test server/scoring/locations.test.js server/scoring/scoring.test.js server/sourceEvidence.test.js server/comparisonRules.test.js src/lib/*.test.js
npm run build -- --configLoader runner
```

No API key, Supabase access or paid model call is required for these checks. The test runner reports assertion failures in the terminal and exits nonzero on failure. Restart the backend after installing this change, then analyze the pair again: existing saved findings are not automatically rescored.

## Observed deterministic results

The ten location test groups and existing regression files passed locally (34 Node test entries, including grouped legacy assertion files). The production frontend build and targeted lint checks also passed. No live Claude analysis or browser interaction was used to obtain these results.

With the current provisional configuration, the copy/paste pair returns 77/100: E=0.85, C=0.80, round(100 × 0.85 × (0.5 + 0.5 × 0.80)). E=0.85 is a conservative engineering setting for a nominal venue discrepancy whose physical identity is unverified. It is not learned from the fixtures or measured against reviewer labels. These observations do not calibrate accuracy or a probability.

## Deliberate limits

The parser supports affirmative first-person “I saw [named subject] at [venue]” and “I was at [venue]” sentences, with a source date and exact time in either order. Unique question date anchors are supported. Literal source text is parsed after existing quote validation, so a missing model field does not itself block this supported pattern. The complete verified source sentence is used for commitment checks.

The venue vocabulary includes stores, gyms, libraries, hospitals, schools, offices, warehouses, restaurants, cafes, banks, courthouses and home. It does not geocode addresses, resolve arbitrary aliases, infer pronoun identities, or understand every sentence structure. Unsupported syntax and ambiguous venue relations still require review. No production rule contains Nathan's name, the example date or an expected fixture answer. No classifier prompt or formula weights were changed; only a new configurable location strength was added.
