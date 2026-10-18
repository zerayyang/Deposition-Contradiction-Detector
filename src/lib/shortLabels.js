// Few-word labels for the review screen. Full explanations stay under "More details".
const RULES = [
  [/^Different subjects/i, "Different topics"],
  [/^Different circumstances/i, "Different time or occasion"],
  [/^Both can be true: ([^,]+)/i, m => `Compatible: ${m[1]}`],
  [/^Code check: .*do not overlap/i, "Estimates don't overlap"],
  [/^Code check: different exact/i, "Numbers differ"],
  [/^Code check: .*\boverlap\./i, "Numbers overlap"],
  [/affirm vs deny/i, "Said yes, then no"],
  [/exhaustive vs exception/i, "\"Never/only\" vs an exception"],
  [/different exact values/i, "Different exact values"],
  [/requires inference|cannot both be true/i, "Needs inference"],
  [/non overlapping approximations/i, "Estimates don't overlap"],
  [/^No conflict/i, "No clash"],
];
export function shortRule(rule) {
  if (!rule) return null;
  for (const [pattern, label] of RULES) { const m = String(rule).match(pattern); if (m) return typeof label === "function" ? label(m) : label; }
  return String(rule).split(/[.:]/)[0];
}
export function firstSentence(text, max = 160) {
  const s = String(text ?? "").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
export function findingTitle(result) {
  const headline = String(result?.headline ?? result?.eventDetails?.issue ?? "").trim();
  if (headline) return headline.length > 60 ? `${headline.slice(0, 59)}…` : headline;
  const quote = String(result?.claim1?.original ?? "").trim();
  return quote ? `“${quote.length > 50 ? `${quote.slice(0, 49)}…` : quote}”` : "Finding";
}
