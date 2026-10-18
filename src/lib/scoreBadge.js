// One plain-language label for a finding's confidence score, used in the list and the card.
const bands = { STRONG: "strong", MODERATE: "moderate", LIMITED: "limited", WEAK: "weak" };
export function scoreBadge(result) {
  const score = result?.humanConfidence;
  if (result?.type === "FALSE_POSITIVE") return { kind: "compatible", value: "OK", text: "Compatible — not a contradiction" };
  if (!Number.isFinite(score)) return { kind: "none", value: "–", text: "No score — a quote could not be matched to the witness's answers" };
  return { kind: "conflict", value: String(score), text: `${score} / 100 confidence · ${bands[result.band] ?? "unrated"}` };
}
