// Shared application budgets, not provider maximums. Oversize inputs fail explicitly.
export const DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 50 * 1024 * 1024,
  textBytes: 12 * 1024 * 1024,
  requestBytes: 160 * 1024 * 1024,
  chunkBytes: 240 * 1024,
  overlapBytes: 12 * 1024,
  questionBytes: 24 * 1024,
  singleRequestBytes: 480 * 1024,
  maxRequests: 10000,
});
export const utf8Bytes = text => new TextEncoder().encode(text).length;
export function checkTextBudget(text) {
  if (typeof text !== 'string' || utf8Bytes(text) > DOCUMENT_LIMITS.textBytes) throw new Error('Each extracted transcript must fit within 12 MiB of UTF-8 text. No text was truncated.');
}
export function checkFileBudget(file) {
  if (!file?.size || file.size > DOCUMENT_LIMITS.fileBytes) throw new Error('Choose a non-empty file up to 50 MiB. Your Supabase global limit must also allow this size.');
}
