const count = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function progressCounts(analysis) {
  const total = count(analysis.planned);
  const completed = Math.min(total, count(analysis.completed));
  const failed = Math.min(total - completed, count(analysis.failed));
  const partial = Math.min(total - completed - failed, count(analysis.partial));
  return { total, completed, failed, partial, processed: completed + failed + partial };
}

export function durationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

export function remainingLabel(analysis, active, elapsed, sample) {
  if (analysis.status !== 'running' || !active) return null;
  const { total, processed } = progressCounts(analysis);
  if (processed >= total && total > 0) return 'Finishing up…';
  if (!sample || sample.processed < 1 || sample.elapsed <= 0) return 'Calculating time remaining…';
  const remaining = sample.elapsed / sample.processed * (total - sample.processed) - Math.max(0, elapsed - sample.elapsed);
  return remaining > 0 ? `About ${durationLabel(remaining)} remaining` : 'Taking longer than estimated…';
}

export function friendlyFailure(error = '') {
  if (/max_tokens/i.test(error)) return 'The AI reached its output limit before finishing. This comparison needs another approved analysis.';
  if (/quotation.*outside|quote.*section|quotation.*grounded|quotation.*passage/i.test(error)) return 'A quoted passage did not exactly match its source section.';
  if (/contradictions array/i.test(error)) return 'The AI response did not include the required findings list.';
  if (/timeout|timed out/i.test(error)) return 'The comparison took too long.';
  if (/credit|billing|payment/i.test(error)) return 'The AI provider reported a billing problem.';
  if (/json|parse|truncat|max.tokens|stop.reason/i.test(error)) return 'The AI response could not be read completely.';
  if (/network|fetch|connect/i.test(error)) return 'The connection was interrupted.';
  return 'This comparison could not be completed.';
}
