// Reads the deponent's name from a transcript's caption ("Deposition of Riley Morgan",
// "WITNESS: DONALD J. TRUMP"). Deterministic text matching only, never a model guess.
// Returns null when no caption is found or captions name different people.
// "THE WITNESS:" is a speaker label inside testimony, not a caption.
const CAPTION = /\b(?:deposition|testimony|examination)\s+of\s+|(?<!\bthe\s)\bwitness\s*:\s*/gi;
const STOP = new Set(['PAGE', 'ON', 'IN', 'TAKEN', 'VOL', 'VOLUME', 'DATE', 'AT', 'THE', 'AND', 'BY', 'BEFORE', 'HELD']);
const HONORIFIC = new Set(['MR', 'MRS', 'MS', 'DR', 'MISS']);
const SCAN_CHARS = 15000;

function nameAfter(text, start) {
  const tokens = [];
  // A caption name sits on one line; a wrapped name is ignored rather than guessed.
  const line = text.slice(start, start + 80).split(/\r?\n/)[0];
  for (const raw of line.split(/[\s,]+/)) {
    if (!raw || /^\d/.test(raw) || /^[—–-]+$/.test(raw)) break;
    const word = raw.replace(/[:;.,]+$/, '');
    const upper = word.toUpperCase().replace(/\./g, '');
    if (!/^[A-Z][A-Za-z'’.-]*$/.test(word) || STOP.has(upper)) break;
    if (!HONORIFIC.has(upper)) tokens.push(upper);
    if (tokens.length === 4) break;
  }
  // A name ending in an initial ("DONALD J.") was cut by a line break.
  return tokens.length >= 2 && tokens[tokens.length - 1].length > 1 ? tokens : null;
}

// Compare on first and last name so "Donald J. Trump" matches "DONALD TRUMP".
const key = tokens => `${tokens[0]} ${tokens[tokens.length - 1]}`;

export function detectWitnessName(text) {
  if (typeof text !== 'string') return null;
  const head = text.slice(0, SCAN_CHARS), found = new Map();
  for (const match of head.matchAll(CAPTION)) {
    const tokens = nameAfter(head, match.index + match[0].length);
    if (!tokens) continue;
    const k = key(tokens);
    if (!found.has(k) || found.get(k).length < tokens.length) found.set(k, tokens);
  }
  if (found.size !== 1) return null;
  const [tokens] = found.values();
  return {key: key(tokens), display: tokens.map(t => t.charAt(0) + t.slice(1).toLowerCase()).join(' ')};
}

// 'same' when both captions name one person, 'different' when they disagree, else 'unknown'.
export function compareWitnesses(text1, text2) {
  const a = detectWitnessName(text1), b = detectWitnessName(text2);
  if (!a || !b) return {status: 'unknown', names: [a?.display ?? null, b?.display ?? null]};
  return {status: a.key === b.key ? 'same' : 'different', names: [a.display, b.display]};
}
