import express from "express";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";

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
            max_tokens: 5000, // decided the LLM needs more reasoning and 3000 was too limited

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
        const parsed = JSON.parse(rawText);

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