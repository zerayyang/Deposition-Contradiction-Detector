import {readingGapLabel,retainedNotesLabel,readingGapWarning,readingHasGaps,readingDocumentStats,readingDocumentLabel} from '../shared/readingState.js';
import { elapsedLabel, friendlyFailure, progressCounts, remainingLabel, citationFailureDetails, readingRecoveryAction, withReadingDiagnostics } from './lib/analysisStatus.js';

export default function AnalysisStatus({ analysis, active, elapsed = 0, timing }) {
  if (!analysis) return null;
  const { total, completed, failed, partial, processed } = progressCounts(analysis);
  // Hosted runs save a partial result after each step; while the run is active that is progress, not an outcome.
  const running = analysis.status === 'running' || (active && analysis.status === 'partial');
  const titles = {awaiting_gap_acknowledgement:'Reading incomplete—review required · acknowledgement needed',reading_gaps:'Comparison finished with reading gaps', complete: 'Analysis complete', partial: 'Review partly complete', failed: 'Analysis could not finish', cancelled: 'Analysis cancelled', awaiting_comparison: 'Events saved · comparison approval needed', interrupted: 'Review interrupted' };
  const reading=analysis.workflow==='events-v1'&&analysis.phase==='extract';
  const unit=analysis.workflow==='events-v1'&&analysis.phase==='extract'?'extraction requests':'comparisons';
  const gaps=readingHasGaps(analysis),documents=readingDocumentStats(analysis);
  // Gaps are reported once reading stops; while steps are still running, unread ranges are just pending.
  const inProgress = running && active;
  const title = inProgress ? 'Reviewing your documents' : gaps ? readingGapLabel : running ? 'Review interrupted' : (titles[analysis.status] ?? 'Review status');
  const remaining = remainingLabel(analysis, active, elapsed, timing);
  const failures = (analysis.tasks ?? []).filter(task => task.status === 'failed' || task.status === 'partial').map(task=>withReadingDiagnostics(analysis,task));
  const coverage = analysis.coverage ?? [];
  const reviewIssues = (analysis.issues ?? []).filter(issue => !failures.some(task => task.id === issue.pairId));
  return <section className="analysis-status" aria-label="Analysis progress">
    <div className="analysis-status-heading"><h2>{title}</h2><span>{processed} of {total} {unit} finished</span></div>
    {documents.length>0&&<div aria-label="Reading coverage by document">{documents.map(doc=><p key={doc.document}><strong>{readingDocumentLabel(doc)}</strong></p>)}</div>}
    {gaps&&!inProgress&&<aside className="event-gap-review" role="note"><strong>{retainedNotesLabel}</strong><p>{readingGapWarning}</p></aside>}
    <progress aria-label="Comparisons finished" value={processed} max={total || 1} />
    <div className="analysis-status-stats"><span>{completed} successful</span>{failed > 0 && <span>{failed} failed</span>}{partial > 0 && <span>{partial} partly completed</span>}{Number.isFinite(elapsed) && <span>Elapsed: {elapsedLabel(elapsed)}</span>}</div>
    {remaining && <p role="status" className="analysis-remaining">{remaining}</p>}
    {running && active && <small>An estimate appears after the first comparison, then updates as comparisons finish. Document length and AI response speed can change the estimate.</small>}
    {analysis.status !== 'complete' && <p>{running && active ? 'Results will appear as comparisons finish. The review is still in progress.' : 'This is not a complete review. Any finished results have been retained.'}</p>}
    {(coverage.length > 0 || failures.length > 0 || reviewIssues.length > 0) && <details open={reading && failures.length > 0}><summary>Review details</summary>
      {coverage.map((document, index) => {
        const pages = document.pages;
        return <p key={document.document ?? index}>Transcript {document.document ?? index + 1}: {Array.isArray(pages) ? `${pages.filter(page => page.analysisStatus === 'complete').length} of ${document.pageCount ?? pages.length} pages fully compared` : `${(document.sections ?? []).filter(section => section.status === 'complete').length} of ${(document.sections ?? []).length} sections fully compared`}.</p>;
      })}
      {failures.length > 0 && <ul>{failures.map((task, index) => <li key={task.id ?? index}>{reading?'Reading request':'Comparison'} {Number.isInteger(task.a) && Number.isInteger(task.b) ? `${task.a + 1} × ${task.b + 1}` : index + 1}: {friendlyFailure(task.stopReason === 'max_tokens' ? 'max_tokens' : task.error)}{task.rejectedFindings?.length > 0 && <span> {task.acceptedFindings ?? 0} {reading?'notes':'findings'} retained; {task.rejectedFindings.length} rejected. {task.rejectedFindings.map((finding, i) => <span key={i}>{reading?'Note':'Finding'} {finding.candidateIndex + 1}: {friendlyFailure(finding.reason)} </span>)}</span>}{reading && citationFailureDetails(task).length > 0 && <ul>{citationFailureDetails(task).map(detail=><li key={detail.code+(detail.path??'')}>{detail.message} <small>{detail.code}{detail.path?` · ${detail.path}`:''}</small></li>)}</ul>}</li>)}</ul>}
      {reading && failures.length > 0 && <p>{readingRecoveryAction}</p>}
      {reviewIssues.length > 0 && <p>{reviewIssues.length} findings need source review and may have no score. Their source evidence could not be fully verified.</p>}
    </details>}
  </section>;
}
