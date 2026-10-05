import { useState } from "react";
import { ReviewCard, ScoreGuide } from "./ReviewCard.jsx";

// Two depositions from the same witness, 6 months apart
const TRANSCRIPT_1 = `
Deposition of Marcus Webb — March 14, 2023

Q: Where were you on the evening of November 3rd?
A: I was at home all evening. I ordered pizza around 7pm and watched TV.

Q: Did you speak to anyone that night?
A: No, I was alone. My wife was visiting her sister in Portland.

Q: What time did you go to sleep?
A: Around 10, maybe 10:30. I had work the next morning.

Q: Have you ever been to the Hargrove Street warehouse?
A: No, never. I don't even know where that is.

Q: Do you own a grey Honda Civic?
A: I did at the time, yes. I sold it in January.

Q: Had you met Daniel Cho before November 3rd?
A: No. I'd never heard of him before this whole thing started.
`;

const TRANSCRIPT_2 = `
Deposition of Marcus Webb — September 9, 2023

Q: Walk me through the evening of November 3rd again.
A: I was home. I think I went out briefly to get some groceries, maybe around 7:30, but came right back.

Q: You mentioned last time you ordered pizza. Now you're saying groceries?
A: I might have done both. I don't remember exactly, it was almost a year ago.

Q: Did anyone see you that evening?
A: My neighbor, Tom, might have seen me. We waved or something in the parking lot.

Q: What time did you go to sleep?
A: It was late. Midnight maybe. I had trouble sleeping.

Q: Had you ever visited the Hargrove Street area?
A: I mean, I've driven through that part of town. I didn't say I'd never been in that general area.

Q: And Daniel Cho — did you know him?
A: I knew of him. We had mutual friends. I don't think I'd met him face to face.
`;

export default function DepositionChecker() {
  const [transcript1, setTranscript1] = useState(TRANSCRIPT_1);
  const [transcript2, setTranscript2] = useState(TRANSCRIPT_2);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    // Prevent duplicate requests
    if (loading) {
      return;
    }

    if (!transcript1.trim() || !transcript2.trim()) {
      setError("Provide two non-empty transcripts.");
      return;
    }
    setLoading(true);
    setElapsedSeconds(0);
    setTotalSeconds(null);
    const startedAt = performance.now();
    const elapsedTimer = setInterval(() => setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transcript1,
          transcript2
        })
      });

      const data = await res.json();



      // Step 4: Show a clear error instead of a blank page
      if (!res.ok) {
        throw new Error(
          data?.error || "Analysis request failed"
        );
      }

      if (!Array.isArray(data?.contradictions)) {
        throw new Error(
          "The server returned an invalid contradictions result."
        );
      }

      setResults(data.contradictions);
    } catch (e) {
      setError(
        e?.message ||
          "Failed to analyze depositions."
      );
    } finally {
      clearInterval(elapsedTimer);
      setTotalSeconds((performance.now() - startedAt) / 1000);
      setLoading(false);
    }
  }

  const flaggedResults = (results ?? [])
    .filter(
      (r) =>
        r?.type === "DIRECT" ||
        r?.type === "INFERENTIAL"
    )
    .sort((a, b) => {
      const typeOrder = {
        DIRECT: 0,
        INFERENTIAL: 1
      };

      const severityOrder = {
        HIGH: 0,
        MEDIUM: 1,
        LOW: 2
      };

      const typeDifference =
        (typeOrder[a?.type] ?? 99) -
        (typeOrder[b?.type] ?? 99);

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return (
        (severityOrder[a?.severity] ?? 99) -
        (severityOrder[b?.severity] ?? 99)
      );
    });

  const dismissedResults = (results ?? []).filter(r => r?.type === "FALSE_POSITIVE");

  return <main className="app-shell">
    <header className="app-header"><span className="eyebrow">Deposition review workspace</span><h1>Compare testimony.<br/>Understand the differences.</h1><p>Review potential contradictions with exact quotes, AI explanations and transparent checks from human-written code.</p></header>
    <section className="input-panel"><div className="section-heading"><div><h2>Your transcripts</h2><p>Keep the questions and answers together so the analysis can interpret their context.</p></div><span className="privacy-note">Analysis sends this text to Anthropic.</span></div>
      <div className="transcript-grid">{[[transcript1,setTranscript1],[transcript2,setTranscript2]].map(([value,setValue],i)=><label key={i}><span>Transcript {i+1}</span><textarea aria-label={`Transcript ${i+1}`} value={value} onChange={e=>setValue(e.target.value)} disabled={loading} rows={18}/></label>)}</div>
      <div className="action-row"><button onClick={analyze} disabled={loading}>{loading ? "Analyzing testimony…" : "Find contradictions"}</button><span className="muted">AI classification + independent code scoring</span></div>
      {loading && <p role="status" aria-live="polite">Analysis running · {elapsedSeconds}s elapsed. {elapsedSeconds>=60 ? "The request is still running; keep this page open." : "Results appear when the complete response arrives."}</p>}
      {!loading && totalSeconds!==null && <p role="status" className="timing">{results ? "Analysis completed" : "Request ended"} in {totalSeconds>=60 ? `${Math.floor(totalSeconds/60)}m ${(totalSeconds%60).toFixed(1)}s` : `${totalSeconds.toFixed(1)}s`} total.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <ScoreGuide/>
    {results && <section className="results-section"><div className="section-heading"><div><span className="eyebrow">Analysis results</span><h2>{flaggedResults.length} flagged · {dismissedResults.length} false positives</h2></div></div>
      <div className="category-legend"><div><span className="legend-dot direct"/><b>Direct</b><p>Explicitly incompatible claims.</p></div><div><span className="legend-dot inferential"/><b>Inferential</b><p>A conflict established through reasoning.</p></div><div><span className="legend-dot false_positive"/><b>False positive</b><p>A candidate conflict that is compatible or unestablished.</p></div></div>
      {flaggedResults.length===0 && <p className="empty-state">No direct or inferential contradictions were flagged in this response.</p>}
      {flaggedResults.map((r,i)=><ReviewCard key={i} result={r}/>)}
      {dismissedResults.length>0 && <details className="dismissed-section"><summary>Review false positives ({dismissedResults.length})</summary><p className="muted">Read the explanation to distinguish compatibility from missing context.</p>{dismissedResults.map((r,i)=><ReviewCard key={i} result={r} dismissed/>)}</details>}
    </section>}
  </main>;
}
