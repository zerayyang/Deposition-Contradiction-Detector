import {reviewStages} from './lib/reviewProgress.js';
import { elapsedLabel, friendlyFailure, progressCounts, unscoredOnlyCount, remainingLabel, droppedSuggestionCount, fullyCompared } from './lib/analysisStatus.js';

export default function AnalysisStatus({ analysis, active, elapsed = 0, timing, phase = 'analysis', findings = [] }) {
  if (!analysis) return null;
  const { total, completed, failed, partial, processed } = progressCounts(analysis);
  // Hosted runs save a partial result after each step; while the run is active that is progress, not an outcome.
  const scoring=active&&phase==='scoring';
  const scoreStage=scoring?reviewStages(analysis,findings,'scoring')[2]:null;
  const running = analysis.status === 'running' || (active && analysis.status === 'partial');
  const titles = {complete: 'Analysis complete', partial: 'Review partly complete', failed: 'Analysis could not finish', cancelled: 'Analysis cancelled', interrupted: 'Review interrupted' };
  const inProgress = scoring || (running && active);
  const title = scoring?'Checking confidence':inProgress ? 'Reviewing your documents' : running ? 'Review interrupted' : droppedSuggestionCount(analysis) ? 'Analysis complete' : unscoredOnlyCount(analysis) ? 'Analysis complete · some findings unscored' : (titles[analysis.status] ?? 'Review status');
  const remaining = remainingLabel(analysis, active, elapsed, timing);
  const failures = (analysis.tasks ?? []).filter(task => task.status === 'failed' || task.status === 'partial');
  const coverage = analysis.coverage ?? [];
  const reviewIssues = (analysis.issues ?? []).filter(issue => !failures.some(task => task.id === issue.pairId));
  const failedRun = !running && ["failed","partial","cancelled"].includes(analysis?.status) && !fullyCompared(analysis);
  const barValue=scoring?scoreStage.percent:inProgress&&processed===0?undefined:processed;
  const barMax=scoring?100:total||1;
  const indeterminate=scoring?scoreStage.percent===null:inProgress&&processed===0;
  return <section className={`analysis-status${failedRun ? " is-error" : ""}`} aria-label="Analysis progress">
    <div className="analysis-status-heading"><h2>{title}</h2><span>{scoring?scoreStage.detail:`${processed} of ${total} comparisons finished`}</span></div>
    <div className="analysis-progress-track">
      <progress aria-label={scoring?'Confidence checks finished':inProgress&&processed===0?'Waiting for the first comparison; completed progress not yet available':'Comparisons finished'} value={indeterminate?undefined:barValue} max={barMax} />
      {indeterminate&&<span className="analysis-progress-activity" aria-hidden="true" />}
    </div>
    <div className="analysis-status-stats">{!scoring&&<span>{completed} successful</span>}{!scoring&&failed > 0 && <span>{failed} failed</span>}{!scoring&&partial > 0 && <span>{partial} partly completed</span>}{Number.isFinite(elapsed) && <span>Elapsed: {elapsedLabel(elapsed)}</span>}</div>
    {inProgress&&<p className="analysis-in-progress" role="status"><span className="review-loading-spinner" aria-hidden="true" />In Progress<span className="analysis-progress-dots" aria-hidden="true" /></p>}
    {scoring&&analysis.status!=='complete'&&<p>Analysis retained partial results. Review the analysis details; finished processing does not mean all findings were validated.</p>}
    {!scoring&&remaining && (!inProgress||processed>0) && <p role="status" className="analysis-remaining">{remaining}</p>}
    {!inProgress&&analysis.status !== 'complete' && <p>{droppedSuggestionCount(analysis) ? `All sections were compared. ${droppedSuggestionCount(analysis)} suggested finding${droppedSuggestionCount(analysis) === 1 ? ' was' : 's were'} dropped because the quote is not in the transcript word for word. Everything else is shown.` : unscoredOnlyCount(analysis) ? `All sections were compared. ${unscoredOnlyCount(analysis)} finding${unscoredOnlyCount(analysis) === 1 ? '' : 's'} could not be tied to one exact question and answer, so ${unscoredOnlyCount(analysis) === 1 ? 'it is' : 'they are'} shown without a confidence score.` : 'This is not a complete review. Any finished results have been retained.'}</p>}
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
