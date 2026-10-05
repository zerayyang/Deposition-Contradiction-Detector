# Deposition Contradiction Detector

A local app that compares two depositions, identifies potential contradictions, and explains the automated checks behind each result. It combines Claude's reading of the testimony with fixed rules for facts such as times, quantities, activities, states, and knowledge of a person.

## Quick start

You need:

- **Node.js 24** and npm: [download Node.js](https://nodejs.org/).
- **Git**: [download Git](https://git-scm.com/downloads).
- Your own **Anthropic API key** with access to Claude Opus 5.5. Requests are billed to the account associated with that key.

Open Terminal on Mac/Linux or PowerShell on Windows and paste this one command:

```sh
git clone https://github.com/zerayyang/Deposition-Contradiction-Detector.git; cd Deposition-Contradiction-Detector; node start.mjs
```

Run it in a folder where you want to keep the project. If cloning fails, stop and resolve repository access before continuing.

On the first run, the launcher asks for your Anthropic API key. Pasting is hidden; press Enter afterward. It saves the key locally in `.env`, installs dependencies, starts the backend and frontend, and opens your browser at **http://localhost:5173**.

Click **Find Contradictions** to analyze the included sample depositions. Keep the terminal open while using the app. Press **Ctrl+C** to stop.

For later runs, open a terminal in the project folder and run:

```sh
node start.mjs
```

If you prefer to configure the key manually, copy `.env.example` to `.env` and replace the placeholder. A GitHub token or SSH key is not an Anthropic API key. `.env` is excluded from Git; do not share it.

## What the app does

1. **Claude reads the testimony.** It identifies pairs of claims and classifies them as `DIRECT`, `INFERENTIAL`, or `FALSE_POSITIVE`.
2. **Code validates the literal evidence.** Quotes and extracted phrases must occur in their sources. Invalid evidence receives no score.
3. **Code applies narrow conflict rules to the quotes themselves.** It does not use Claude's type, reasoning, semantic suggestions, or interpretations. Supported rules currently cover complete signing assertions about the same object; continuous home presence versus leaving on the same explicit date during the defined evening (6 PM–midnight); and exact times for the same literal event and explicit date.
4. **The strongest supported rule determines conflict strength.** Rule ratings are 0 (no conflict established), 0.5 (possible conflict), or 1 (strong conflict). Matching details do not cancel a conflict. The numeric rating uses 85% strongest supported evidence and 15% language strength from the existing phrase database. Compatible evidence stays at zero; unsupported or invalid evidence gets no rating. The conflict-strength label still follows the evidence rule. Coverage does not cap the score.
5. **Review flags preserve Claude's classification.** Disagreement, unverified evidence, or insufficient context prompts human review.

## Reading the cards

- **Rule-based conflict strength:** Strong conflict, Possible conflict, No conflict established, Insufficient context, or Unverified evidence.
- **Contributing rules:** The literal rules and their ratings; these are not probabilities.
- **Language score:** The existing deterministic phrase database supplies 15% of a supported numeric rating; it cannot create a conflict.
- **Field checks:** Legacy extracted-field comparisons for context. They do not determine the active conflict score.
- **Review recommended:** Inspect the evidence or resolve missing context.

For example, “I was at home all evening on November 3” versus “I left home at 7 PM on November 3” produces strong conflict evidence. Being home at 6 PM and leaving at 7 PM does not trigger this rule. Missing dates, relative-day expressions, and ambiguous clock values receive insufficient context rather than an assumed comparison.

These deliberately limited rules do not understand every event, pronoun, paraphrase, date format, or surrounding question. The included demo may therefore receive insufficient-context ratings even where Claude flags a candidate. A blank score is not a dismissal. The previous scoring functions remain for comparison and regression coverage, but the API uses `scoreValidatedQuotes` for active scoring.

This is a prototype for human review. Its ratings are not calibrated probabilities, credibility judgments, or legal conclusions.

## Included demo and project files

The app currently analyzes two built-in sample depositions. It does not have a document-upload interface. Edit `TRANSCRIPT_1` and `TRANSCRIPT_2` in `src/App.jsx` to try other text.

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Sample transcripts and result cards |
| `server/server.js` | Claude request and response processing |
| `server/TestimonyFact.js` | Extracted fact objects |
| `server/comparisonRules.js` | Evidence rules, scoring, and reconciliation |
| `server/deterministicConfidence.js` | Active literal conflict checker |
| `server/confidenceratehuman.js` | Separate language score and legacy scoring |
| `server/proper_prompts.md` | Instructions sent to Claude |
| `start.mjs` | Local setup and launcher |

Live analysis sends the sample testimony, or any text you put in its place, to Anthropic.

## Checks

Run the unit tests:

```sh
node server/comparisonRules.test.js
```

Expected output:

```text
All comparisonRules tests passed.
```

Build the frontend:

```sh
npm run build
```

## Troubleshooting

- **`node` or `git` is not recognized:** install it, then reopen your terminal.
- **Repository not found or authentication failed:** confirm the URL and that your GitHub account has access. Private repositories require an invitation and GitHub authentication.
- **API authentication or model-access error:** check the Anthropic key in `.env`, account billing, and access to the configured model.
- **Port already in use:** stop an earlier copy of the app. The launcher uses port 3000 for the API and port 5173 for the frontend.
- **Browser did not open:** visit http://localhost:5173 manually.
