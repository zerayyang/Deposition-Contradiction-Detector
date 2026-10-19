// Finds where a finding's quote sits in the full transcript so it can be highlighted.
// Saved offsets are used first, and only when the text there really is the quote.
const squash = value => String(value ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

export function locateQuote(text, quote, offsets = []) {
  const source = String(text ?? ""), wanted = squash(quote);
  if (!source || wanted.length < 3) return null;
  for (const range of offsets) {
    if (Number.isInteger(range?.start) && Number.isInteger(range?.end) && range.start >= 0 && range.end <= source.length && range.end > range.start
      && squash(source.slice(range.start, range.end)) === wanted) return { start: range.start, end: range.end };
  }
  const exact = source.indexOf(String(quote));
  if (exact >= 0) return { start: exact, end: exact + String(quote).length };
  // Same words, different spacing or line breaks (PDF text often wraps mid-sentence).
  const words = String(quote).trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['‘’]/g, "['‘’]").replace(/["“”]/g, "[\"“”]"));
  const match = new RegExp(words.join("\\s+"), "i").exec(source);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
