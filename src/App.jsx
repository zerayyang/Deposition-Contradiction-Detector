import { useState } from "react";

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

  // Step 5:
  // Separate flagged contradictions from dismissed results.
  // DIRECT comes before INFERENTIAL.
  // Within each type, HIGH comes before MEDIUM, then LOW.
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

  function needsClarification(result) {
    return (
      result?.flag === "REVIEW" ||
      /^(Unresolved timing|Question meaning unresolved)\s*[—–-]/i.test(result?.reasoning ?? "")
    );
  }

  const dismissedResults = (results ?? []).filter(
    (r) => r?.type === "FALSE_POSITIVE"
  );

  function renderEvidencePanel(r, dismissed = false) {
    const notEvaluable = r?.status === "NOT_EVALUABLE";
    const compatible = r?.status === "COMPATIBLE_SUPPORTED";
    const reasonLabels = {
      NO_FACTS: "No supported facts were extracted.",
      UNSUPPORTED_PATTERN: "The extracted facts are outside the code rule patterns.",
      MISSING_CONTEXT: "A required person, event, day or time anchor is missing.",
      UNVERIFIED_SOURCE: "A quote or extracted field failed exact source validation."
    };
    const support = (r?.rulesFired ?? []).filter(rule => rule.verdict === "CONFLICT");
    const context = (r?.rulesFired ?? []).filter(rule => rule.verdict !== "CONFLICT");
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 12, color: dismissed ? "#666" : "#111" }}>
        <div>Human confidence — heuristic evidence index</div>
        <strong style={{ fontSize: notEvaluable || compatible || dismissed ? 16 : 28 }}>
          {notEvaluable ? "Not evaluable by code rules" : compatible ? "No conflict found by code rules" : dismissed
            ? `${r.band} code support — not a contradiction rating`
            : `${r.humanConfidence}% · ${r.band}`}
        </strong>
        {notEvaluable && <p>{reasonLabels[r.notEvaluableReason] ?? r.notEvaluableReason}</p>}
        {compatible && <p>Compatibility index: {r.humanConfidence} · {r.band}. This is not a contradiction rating.</p>}
        <p style={{ fontSize: 13 }}>Deterministic heuristic evidence index, not a probability of contradiction or dishonesty. Claude’s type, severity and reasoning do not affect this score.</p>
        {support.length > 0 && <div>
          <strong>Rules that support this score</strong>
          <ul>{support.map(rule => <li key={rule.id}>{rule.id}: {rule.explanation} Strength {rule.strength.toFixed(2)} ({rule.basis.toLowerCase()}).</li>)}</ul>
        </div>}
        {context.length > 0 && <div>
          <strong>Compatible context — no conflict points</strong>
          <ul>{context.map(rule => <li key={rule.id}>{rule.id}: {rule.explanation}</li>)}</ul>
        </div>}
        {(r.rulesLimiting ?? []).length > 0 && <div>
          <strong>Rules that limit it</strong>
          <ul>{r.rulesLimiting.map((rule, i) => <li key={`${rule.id}-${i}`}>{rule.explanation}</li>)}</ul>
        </div>}
        {r.commitment && <p>Commitment: claim 1 {r.commitment.claim1.toFixed(2)}, claim 2 {r.commitment.claim2.toFixed(2)}, pair {r.commitment.pair.toFixed(2)}.</p>}
        {r.languageDetails && <details>
          <summary>Scoped language details</summary>
          {["claim1", "claim2"].map((key, i) => <div key={key}>
            <strong>Claim {i + 1}</strong>
            <ul>{[...(r.languageDetails[key]?.applied ?? []), ...(r.languageDetails[key]?.ignored ?? [])].map((detail, j) =>
              <li key={j}>“{detail.phrase}” — {detail.scope.toLowerCase()}, effect {detail.effect.toFixed(2)}. {detail.explanation}</li>)}</ul>
          </div>)}
        </details>}
        {r.factsCompared && <p>Facts compared: {r.factsCompared.compared} of {r.factsCompared.total}. Informational; does not cap the score.</p>}
        <small>Config: {r.configVersion}. Weights and bands are uncalibrated pending owner-labeled examples.</small>
        {(r?.flag === "REVIEW" || needsClarification(r)) && <div role="status" style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#92400e", borderRadius: 6, padding: 12, marginTop: 12 }}>
          <strong>Needs clarification</strong>
          <ul>{(r.reasons?.length ? r.reasons : ["Review the missing context identified in the AI assessment (does not affect the code score)."]).map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div>}
      </div>
    );
  }

  // Step 9:
  // Display the two claims as Transcript 1 and Transcript 2.
  function renderClaimQuotes(r) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12
        }}
      >
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 12,
            textAlign: "left"
          }}
        >
          <strong>Transcript 1</strong>

          <p>
            "
            {r?.claim1?.original ??
              "No quote available."}
            "
          </p>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 12,
            textAlign: "left"
          }}
        >
          <strong>Transcript 2</strong>

          <p>
            "
            {r?.claim2?.original ??
              "No quote available."}
            "
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
        color: "#111",
        textAlign: "left"
      }}
    >
      <h1>
        ⚖️ Deposition Contradiction Detector
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24
        }}
      >
        <div>
          <h3>Transcript 1</h3>

          <textarea
            aria-label="Transcript 1"
            value={transcript1}
            onChange={event => setTranscript1(event.target.value)}
            disabled={loading}
            rows={24}
            style={{width: "100%", boxSizing: "border-box", background: "#f5f5f5", color: "#111", padding: 12, fontSize: 12, resize: "vertical"}}
          />
        </div>

        <div>
          <h3>Transcript 2</h3>

          <textarea
            aria-label="Transcript 2"
            value={transcript2}
            onChange={event => setTranscript2(event.target.value)}
            disabled={loading}
            rows={24}
            style={{width: "100%", boxSizing: "border-box", background: "#f5f5f5", color: "#111", padding: 12, fontSize: 12, resize: "vertical"}}
          />
        </div>
      </div>

      <button
        onClick={analyze}
        disabled={loading}
        style={{
          padding: "12px 32px",
          fontSize: 16,
          background: "#1a1a2e",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: loading
            ? "not-allowed"
            : "pointer"
        }}
      >
        {loading
          ? "Analyzing..."
          : "Find Contradictions"}
      </button>

      {loading && <p role="status" aria-live="polite">Waiting for Claude’s analysis — {elapsedSeconds}s elapsed. {elapsedSeconds >= 60 ? "The request is still running; avoid submitting it again." : "Results appear when the complete response is received."}</p>}

      {!loading && totalSeconds !== null && (
        <p role="status">
          {results ? "Analysis completed" : "Analysis request ended"} in {totalSeconds >= 60
            ? `${Math.floor(totalSeconds / 60)}m ${(totalSeconds % 60).toFixed(1)}s`
            : `${totalSeconds.toFixed(1)}s`} total.
        </p>
      )}

      {error && (
        <p
          style={{
            color: "#b91c1c",
            background: "#fee2e2",
            padding: 12,
            borderRadius: 6,
            marginTop: 16
          }}
        >
          {error}
        </p>
      )}

      {results && (
        <div style={{ marginTop: 24 }}>
          {/* Step 5: Summary */}
          <h2>
            {flaggedResults.length} flagged,{" "}
            {dismissedResults.length} false positives
          </h2>

          {/* Step 5: Legend */}
          <p
            style={{
              fontSize: 13,
              color: "#555"
            }}
          >
            Direct = explicit contradiction.
            Inferential = contradiction requiring
            interpretation. False positive = considered
            but not treated as a contradiction.
          </p>

          {/* Step 5: Flagged */}
          {flaggedResults.length > 0 && (
            <div>
              <h3>Flagged</h3>

              {flaggedResults.map((r, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                    borderLeft: `4px solid ${
                      r?.type === "DIRECT"
                        ? "#ef4444"
                        : "#f59e0b"
                    }`
                  }}
                >
                  {/* Step 6: AI assessment (does not affect the code score) */}
                  <div
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 12,
                      textAlign: "left"
                    }}
                  >
                    <strong>
                      AI assessment (does not affect the code score)
                    </strong>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        marginBottom: 10,
                        alignItems: "center",
                        flexWrap: "wrap"
                      }}
                    >
                      <span
                        style={{
                          background:
                            r?.type === "DIRECT"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color: "#111",
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: "bold"
                        }}
                      >
                        {r?.type ?? "UNKNOWN"}
                      </span>

                      <span
                        style={{
                          fontSize: 12,
                          color: "#444"
                        }}
                      >
                        AI severity:{" "}
                        {r?.severity ?? "Unknown"}
                      </span>
                    </div>

                    <p>
                      {r?.reasoning ??
                        "No reasoning provided."}
                    </p>
                  </div>

                  {/* Steps 6, 7, 8 */}
                  {renderEvidencePanel(r)}

                  {/* Step 9 */}
                  {renderClaimQuotes(r)}
                </div>
              ))}
            </div>
          )}

          {/* Step 5 + 8: Dismissed */}
          {dismissedResults.length > 0 && (
            <details style={{ marginTop: 24 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                False positives — compatible or unresolved (
                {dismissedResults.length})
              </summary>

              <div style={{ marginTop: 12 }}>
                {dismissedResults.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 12,
                      opacity: needsClarification(r) ? 1 : 0.75
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 12
                      }}
                    >
                      <span
                        style={{
                          background: "#f3f4f6",
                          color: "#555",
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: "bold"
                        }}
                      >
                        FALSE POSITIVE
                      </span>
                      {needsClarification(r) && <p style={{ color: "#92400e", fontWeight: "bold" }}>Conflict not established — missing context needs review.</p>}

                      <span
                        style={{
                          marginLeft: 8,
                          color: "#666",
                          fontSize: 12
                        }}
                      >
                        AI severity:{" "}
                        {r?.severity ?? "Unknown"}
                      </span>
                    </div>

                    {/* Step 6 */}
                    <div
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 6,
                        padding: 12,
                        marginBottom: 12,
                        textAlign: "left"
                      }}
                    >
                      <strong>
                        AI assessment (does not affect the code score)
                      </strong>

                      <p>
                        {r?.reasoning ??
                          "No reasoning provided."}
                      </p>
                    </div>

                    {/* Step 8 */}
                    {renderEvidencePanel(r, true)}

                    {/* Step 9 */}
                    {renderClaimQuotes(r)}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}