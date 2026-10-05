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
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    // Prevent duplicate requests
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transcript1: TRANSCRIPT_1,
          transcript2: TRANSCRIPT_2
        })
      });

      const data = await res.json();

      console.log(data);

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

  const dismissedResults = (results ?? []).filter(
    (r) => r?.type === "FALSE_POSITIVE"
  );

  // Step 7:
  // Never display UNKNOWN as 0 or as a blank value.
  function getComparisonDisplay(value) {
    if (value === "UNKNOWN") {
      return "Could not compare";
    }

    return value ?? "Could not compare";
  }

  function getCoverageDisplay(r) {
    if (
      r?.evidenceCoverage === null ||
      r?.evidenceCoverage === undefined
    ) {
      return "Could not compare";
    }

    return `${Math.round(
      r.evidenceCoverage * 100
    )}%`;
  }

  // Steps 6, 7, 8:
  // Automated evidence panel.
  function renderEvidencePanel(
    r,
    dismissed = false
  ) {
    const languageScore =
      typeof r?.languageScore === "number"
        ? r.languageScore
        : null;

    const languageOnlyDismissed = r?.humanConfidence == null;
    function fieldCheck(field) {
      const rules = {
        location: ["location+activity"],
        state: ["state"],
        person: []
      };
      const scored = (r?.evidenceDetails ?? []).some(detail => rules[field].includes(detail.rule));
      return scored ? getComparisonDisplay(r?.comparisons?.[field]) : "Not scored";
    }

    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: 12,
          marginBottom: 12,
          textAlign: "left"
        }}
      >
        <div style={{ color: dismissed ? "#666" : "#111" }}>
          <div>Rule-based conflict strength</div>
          <strong style={{ fontSize: languageOnlyDismissed ? 14 : 28 }}>
            {languageOnlyDismissed
              ? (r?.strength ?? "Insufficient context")
              : typeof r?.humanConfidence === "number"
                ? `${r.strength ?? "Rule rating"} · ${r.humanConfidence}/100`
                : "Could not compare"}
          </strong>

          <p style={{ fontSize: 13 }}>{r?.scoreReason}</p>
          <div style={{ marginTop: 8, fontSize: 14 }}>
            {(r?.evidenceDetails ?? []).map(({ rule, score }) => {
              const label = {
                time: "Time",
                quantity: "Quantity",
                "activity polarity": "Activity polarity",
                state: "State",
                knowledge: "Knowledge",
                "location+activity": "Location + activity"
              }[rule] ?? rule;
              const outcome = score === 1 ? "conflict" : score === 0 ? "compatible" : "possible conflict";
              return <div key={rule}>{label} {outcome}: {score.toFixed(1)}</div>;
            })}
            <div>
              Language score (15% of supported rating): {languageScore !== null ? languageScore.toFixed(2) : "Could not compare"}
            </div>
            <div>Rule ratings describe evidence strength, not probability.</div>
          </div>

          {r?.coverageCapped && (
            <p style={{ fontSize: 13, marginBottom: 0 }}>
              Capped at {r.coverageCap}% because only {getCoverageDisplay(r)} of the facts could be compared.
            </p>
          )}

          {r?.basis === "LANGUAGE_ONLY" && (
            <p style={{ fontSize: 13, marginBottom: 0 }}>
              Language only, no facts compared
            </p>
          )}

          {dismissed && (
            <p style={{ fontSize: 13, marginBottom: 0 }}>
              This is not a contradiction rating.
            </p>
          )}
        </div>

        {r?.flag === "REVIEW" && (
          <div role="status" style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#92400e", borderRadius: 6, padding: 12, marginTop: 12 }}>
            <strong>Review recommended</strong>
            <ul>{(r.reasons ?? []).map(reason => <li key={reason}>{reason}</li>)}</ul>
          </div>
        )}

        {r?.comparisons && (
          <div style={{ marginTop: 12 }}>
            <strong>
              Field checks
            </strong>

            <p>
              Time:{" "}
              {getComparisonDisplay(
                r?.comparisons?.time
              )}
            </p>

            <p>
              Activity:{" "}
              {getComparisonDisplay(
                r?.comparisons?.activity
              )}
            </p>

            <p>
              Location:{" "}
              {fieldCheck("location")}
            </p>

            <p>
              Quantity:{" "}
              {getComparisonDisplay(
                r?.comparisons?.quantity
              )}
            </p>

            <p>
              State:{" "}
              {fieldCheck("state")}
            </p>
            <p>Person: {fieldCheck("person")}</p>
          </div>
        )}

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

          <pre
            style={{
              background: "#f5f5f5",
              color: "#111",
              padding: 12,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              textAlign: "left"
            }}
          >
            {TRANSCRIPT_1}
          </pre>
        </div>

        <div>
          <h3>Transcript 2</h3>

          <pre
            style={{
              background: "#f5f5f5",
              color: "#111",
              padding: 12,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              textAlign: "left"
            }}
          >
            {TRANSCRIPT_2}
          </pre>
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
            {dismissedResults.length} dismissed
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
                  {/* Step 6: AI assessment */}
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
                      AI assessment
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
                Considered and dismissed (
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
                      opacity: 0.75
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
                        AI assessment
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