import express from "express";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { calculateHumanConfidence } from "./confidenceratehuman.js";
import { validateClaim } from "./evidenceValidator.js";
import { TestimonyFact } from "./TestimonyFact.js";
import { calculateEvidenceScore } from "./comparisonRules.js";

const AI_INSTRUCTIONS = fs.readFileSync(
    "./server/proper_prompts.md",
    "utf8"
);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const app = express();

app.use(express.json());

app.post("/api/analyze", async (req, res) => {
    const { transcript1, transcript2 } = req.body;

    try {
        const message = await anthropic.messages.create({
            model: "claude-opus-5-5",
            max_tokens: 10000,

            system: AI_INSTRUCTIONS,

            messages: [
                {
                    role: "user",
                    content: `
TRANSCRIPT 1:
${transcript1}

TRANSCRIPT 2:
${transcript2}

Analyze these two depositions according to the provided instructions.
`
                }
            ]
        });

        const textBlock = message.content.find(
            block => block.type === "text"
        );

        const rawText = textBlock.text;

        const cleanedText = rawText // fixed the JSON formatting issues
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        console.log("CLAUDE RAW OUTPUT:");
        console.log(rawText);
        console.log("STOP REASON:", message.stop_reason);

        const parsed = JSON.parse(cleanedText);

        parsed.contradictions = parsed.contradictions.map(contradiction => {

            // Validate that Claude's extracted evidence actually exists
            // in the original testimony
            const claim1Valid = validateClaim(contradiction.claim1);
            const claim2Valid = validateClaim(contradiction.claim2);

            console.log("Claim 1 valid:", claim1Valid);
            console.log("Claim 2 valid:", claim2Valid);

            // Convert Claude's structured claims into our own TestimonyFact objects
            const fact1 = new TestimonyFact(contradiction.claim1);
            const fact2 = new TestimonyFact(contradiction.claim2);

            // Calculate deterministic evidence strength using our own logic
            const evidenceScore = calculateEvidenceScore(fact1, fact2);

            console.log("Evidence score:", evidenceScore);

            const humanConfidence = calculateHumanConfidence(
                contradiction.claim1.original,
                contradiction.claim2.original,
                contradiction.type
            );

            return {
                ...contradiction,
                humanConfidence
            };
        });

        console.log(parsed);

        res.json(parsed);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to analyze depositions"
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});