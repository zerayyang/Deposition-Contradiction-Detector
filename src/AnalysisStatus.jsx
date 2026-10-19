import { elapsedLabel, friendlyFailure, progressCounts, unscoredOnlyCount, remainingLabel } from './lib/analysisStatus.js';

export default function AnalysisStatus({ analysis, active, elapsed = 0, timing }) {
  if (!analysis) return null;
  const { total, completed, failed, partial, processed } = progressCounts(analysis);
  // Hosted runs save a partial result after each step; while the run is active that is progress, not an outcome.
  const running = analysis.status === 'running' || (active && analysis.status === 'partial');
  const titles = {complete: 'Analysis complete', partial: 'Review partly complete', failed: 'Analysis could not finish', cancelled: 'Analysis cancelled', interrupted: 'Review interrupted' };
  const inProgress = running && active;
  const title = inProgress ? 'Reviewing your documents' : running ? 'Review interrupted' : unscoredOnlyCount(analysis) ? 'Analysis complete · some findings unscored' : (titles[analysis.status] ?? 'Review status');
  const remaining = remainingLabel(analysis, active, elapsed, timing);
  const failures = (analysis.tasks ?? []).filter(task => task.status === 'failed' || task.status === 'partial');
  const coverage = analysis.coverage ?? [];
  const reviewIssues = (analysis.issues ?? []).filter(issue => !failures.some(task => task.id === issue.pairId));
  const failedRun = !running && ["failed","partial","cancelled"].includes(analysis?.status) && !unscoredOnlyCount(analysis);
  return <section className={`analysis-status${failedRun ? " is-error" : ""}`} aria-label="Analysis progress">
    <div className="analysis-status-heading"><h2>{title}</h2><span>{processed} of {total} comparisons finished</span></div>
    <progress aria-label="Comparisons finished" value={processed} max={total || 1} />
    <div className="analysis-status-stats"><span>{completed} successful</span>{failed > 0 && <span>{failed} failed</span>}{partial > 0 && <span>{partial} partly completed</span>}{Number.isFinite(elapsed) && <span>Elapsed: {elapsedLabel(elapsed)}</span>}</div>
    {remaining && <p role="status" className="analysis-remaining">{remaining}</p>}
    {running && active && <small>An estimate appears after the first comparison, then updates as comparisons finish. Document length and AI response speed can change the estimate.</small>}
    {analysis.status !== 'complete' && <p>{running && active ? 'Results will appear as comparisons finish. The review is still in progress.' : unscoredOnlyCount(analysis) ? `All sections were compared. ${unscoredOnlyCount(analysis)} finding${unscoredOnlyCount(analysis) === 1 ? '' : 's'} could not be tied to one exact question and answer, so ${unscoredOnlyCount(analysis) === 1 ? 'it is' : 'they are'} shown without a confidence score.` : 'This is not a complete review. Any finished results have been retained.'}</p>}
    {(coverage.length > 0 || failures.length > 0 || reviewIssues.length > 0) && <details><summary>Review details</summary>
      {coverage.map((document, index) => {
        const pages = document.pages;
        return <p key={document.document ?? index}>Transcript {document.document ?? index + 1}: {Array.isArray(pages) ? `${pages.filter(page => page.analysisStatus === 'complete').length} of ${document.pageCount ?? pages.length} pages fully compared` : `${(document.sections ?? []).filter(section => section.status === 'complete').length} of ${(document.sections ?? []).length} sections fully compared`}.</p>;
      })}
      {failures.length > 0 && <ul>{failures.map((task, index) => <li key={task.id ?? index}>Comparison {Number.isInteger(task.a) && Number.isInteger(task.b) ? `${task.a + 1} × ${task.b + 1}` : index + 1}: {friendlyFailure(task.stopReason === 'max_tokens' ? 'max_tokens' : task.error)}{task.rejectedFindings?.length > 0 && <span> {task.acceptedFindings ?? 0} findings retained; {task.rejectedFindings.length} rejected. {task.rejectedFindings.map((finding, i) => <span key={i}>Finding {finding.candidateIndex + 1}: {friendlyFailure(finding.reason)} </span>)}</span>}</li>)}</ul>}
      {reviewIssues.length > 0 && <p>{reviewIssues.length} findings need source review and may have no score. Their source evidence could not be fully verified.</p>}
    </details>}
  </section>;
}
