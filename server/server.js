import express from "express";

const app = express();

app.use(express.json());

app.post("/api/analyze", (req, res) => {
    const { transcript1, transcript2 } = req.body;

    res.json({
        message: "Server received the transcripts"
    });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});