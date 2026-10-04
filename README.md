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
2. **Code checks the extracted facts.** Each usable rule contributes a score: `0` for compatible evidence, `0.5` for a possible conflict, or `1` for a conflict. Unusable rules do not contribute. Their scores are averaged into the evidence score.
3. **Language is scored separately.** Phrases such as “I clearly remember” or “I don't remember” affect how strongly a claim was expressed.
4. **The final score combines evidence and language.** When evidence is available, it uses 70% evidence and 30% language. Evidence coverage can cap the result.
5. **Disagreements are flagged for review.** The app preserves Claude's original classification and adds a review banner when it disagrees with the code's scored evidence.

For example, a claim extracted with location “at home” and another with activity “went out briefly to get some groceries” trigger the location/activity conflict rule. “Around 7” and “7:30pm” are compatible under the time rule. “I was at home all evening” and “I never left the house” do not trigger the location/activity conflict rule.

## Reading the cards

- **Automated confidence:** the final calculated score, including any coverage cap.
- **Contributing rules:** the rules that actually supplied evidence, with their scores.
- **Language score:** how strongly the statements were expressed.
- **Evidence coverage:** how much of the evidence counted by the coverage calculation the code could evaluate.
- **Field checks:** comparisons of extracted fields. “Not scored” means that field did not contribute through a scoring rule.
- **Review recommended:** Claude and the automated checks disagree and a person should inspect the pair.

If no evidence rule can compare the facts, the card says **“Language only, no facts compared.”** A dismissed result with this basis shows **n/a** rather than a large confidence percentage.

The score is a rule-based indicator, not a calibrated probability or proof that someone lied. This is a prototype for human review, not a legal conclusion.

## Included demo and project files

The app currently analyzes two built-in sample depositions. It does not have a document-upload interface. Edit `TRANSCRIPT_1` and `TRANSCRIPT_2` in `src/App.jsx` to try other text.

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Sample transcripts and result cards |
| `server/server.js` | Claude request and response processing |
| `server/TestimonyFact.js` | Extracted fact objects |
| `server/comparisonRules.js` | Evidence rules, scoring, and reconciliation |
| `server/confidenceratehuman.js` | Language scoring and final confidence |
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
