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

export function elapsedLabel(seconds) {
  if(!Number.isFinite(seconds)||seconds<0)return 'Unavailable';
  const total=Math.floor(seconds),s=total%60,m=Math.floor(total/60)%60,h=Math.floor(total/3600);
  return h?`${h}h ${m}m ${s}s`:total>=60?`${Math.floor(total/60)}m ${s}s`:`${s}s`;
}

// Hosted runs return every task each step, marking earlier steps' work as reused.
// Count all finished tasks, minus those already finished before this run began.
export function stepTiming(tasks, preview, elapsedSeconds) {
  const done = (tasks ?? []).filter(t => ['completed', 'failed', 'partial'].includes(t.status)).length;
  const before = (preview?.cachedRequests ?? 0) + (preview?.retainedGapRequests ?? 0);
  const total = preview?.totalRequestCount ?? ((preview?.requestCount ?? 0) + before);
  const processedThisRun = Math.max(0, done - before);
  return { processed: done, processedThisRun, remaining: Math.max(0, total - done), elapsed: elapsedSeconds };
}

export function remainingLabel(analysis, active, elapsed, sample) {
  if (analysis.status !== 'running' || !active) return null;
  const { total, processed } = progressCounts(analysis);
  if (processed >= total && total > 0) return 'Finishing up…';
  const measured=sample?.processedThisRun??sample?.processed;
  if (!sample || measured < 1 || sample.elapsed <= 0) return 'Waiting for the first comparison to estimate remaining time…';
  const remaining = sample.elapsed / measured * (sample.remaining??(total - sample.processed)) - Math.max(0, elapsed - sample.elapsed);
  return remaining > 0 ? `About ${durationLabel(remaining)} remaining` : 'Taking longer than estimated…';
}

export function friendlyFailure(error = '') {
  const known=Object.keys(citationMessages).find(code=>new RegExp('\\b'+code+'\\b').test(error));
  if(known)return citationMessages[known];
  if (/QUALIFIER_NOT_LITERAL/.test(error)) return 'A qualifier was not supported by the witness’s own quoted words. Question wording cannot be used as a witness qualifier.';
  if (/approved memory|private memory/i.test(error)) return 'Approved lessons changed or could not be checked. Review a fresh plan, or turn memory off. Saved results remain available.';
  if (/finding\(s\) failed source grounding or processing/i.test(error)) return 'Some findings need source review; retained findings remain available.';
  if (/Every source ID|Proposed event failed|Answer disposition lacks|Invalid event schema/i.test(error)) return 'Some reading notes have invalid or missing citations. Valid notes were retained; review the details before continuing.';
  if (/max_tokens/i.test(error)) return 'The AI reached its output limit before finishing. This comparison needs another approved analysis.';
  if (/quotation.*outside|quote.*section|quotation.*grounded|quotation.*passage/i.test(error)) return 'A quoted passage did not exactly match its source section.';
  if (/contradictions array/i.test(error)) return 'The AI response did not include the required findings list.';
  if (/timeout|timed out/i.test(error)) return 'The comparison took too long.';
  if (/credit|billing|payment/i.test(error)) return 'The AI provider reported a billing problem.';
  if (/json|parse|truncat|max.tokens|stop.reason/i.test(error)) return 'The AI response format could not be read. Saved response details can identify the cause.';
  if (/network|fetch|connect/i.test(error)) return 'The connection was interrupted.';
  return 'This comparison could not be completed.';
}

// Only explain known validation codes. Never render arbitrary provider payloads.
export const citationMessages = {
 VERBATIM_MISMATCH: 'The model quotation does not exactly match its cited source text.',
 OCCURRENCE_REQUIRED: 'This quotation repeats. The model must identify which occurrence it means.',
 OCCURRENCE_MISSING: 'The selected occurrence of this quotation does not exist in its source.',
 UNAVAILABLE_SOURCE_UNIT: 'The note cites a source section that was not supplied to this request.',
 NO_WITNESS_QUOTE_IN_CORE: 'The note has no witness quotation in the section assigned for reading.',
 DUPLICATE_EVENT_ID: 'Two notes share the same ID. Both need review; neither was silently overwritten.',
 DUPLICATE_SOURCE_ID: 'A note repeats a citation ID, so its references cannot be trusted.',
 FORBIDDEN_SCORE_ATTRIBUTE: 'The model supplied a score or confidence attribute. Only deterministic code may score evidence.',
 INVALID_EVENT_SCHEMA: 'The proposed note does not match the required record structure.',

 QUALIFIER_NOT_LITERAL: 'A qualifier must quote the witness’s own words; a phrase from the lawyer’s question does not qualify.',
 QUOTE_MISMATCH: 'The quoted text or its offsets do not exactly match the original document.',
 SOURCE_ROLE: 'The citation is outside the assigned witness or question span. Check speaker roles.',
 QUESTION_NOT_GOVERNING: 'The cited question does not govern this witness answer.',
 FIELD_NOT_LITERAL: 'An extracted detail is absent from its cited passage.',
 UNKNOWN_SOURCE: 'The note refers to a citation not included in that same note.',
 PAGE_MISMATCH: 'The citation’s page references do not match its original text offsets.',
 UNSUPPORTED_UNIT_EVENT: 'An answer refers to a note that failed citation checks; that answer remains incomplete.',
 MISSING_UNIT_REVIEW: 'An assigned witness answer was not accounted for.',
 EVENT_REJECTED: 'A proposed note failed citation or record checks. The original response was retained for diagnosis.',
 SCHEMA: 'A proposed note does not match the required record format.',
};
export function citationFailureDetails(task) {
 const output=[],seen=new Set();
 const visit=issue=>{
  if(!issue||typeof issue!=='object')return;
  const message=citationMessages[issue.code];
  if(message){
   const path=typeof issue.path==='string'&&/^\/(?:events|sources|assertion|attributes|qualifiers|units|coverage)(?:\/[A-Za-z0-9_-]+)*$/.test(issue.path)?issue.path:null;
   const key=issue.code+':'+(path??'');
   if(!seen.has(key)){seen.add(key);output.push({code:issue.code,path,message});}
  }
  for(const child of issue.errors??[])visit(child);
 };
 for(const issue of task.validationIssues??[])visit(issue);
 for(const rejected of task.rejectedFindings??[])for(const issue of rejected.diagnostics??[])visit(issue);
 return output;
}
export const readingRecoveryAction='Check the cited question and witness answer, and correct speaker roles if needed. Download the saved analysis report for diagnosis. Valid notes and original documents are retained. A fresh reading attempt needs cost approval; no automatic retry or paid comparison will start.';

// Older saved cases already contain the detailed raw extraction audit. Expose it
// without rerunning the model, changing accepted records or trusting new offsets.
export function withReadingDiagnostics(analysis, task) {
 if(analysis?.workflow!=='events-v1'||analysis?.phase!=='extract')return task;
 const saved=analysis.eventState?.extraction?.tasks?.find(t=>t.id===task.id);
 if(!saved)return task;
 return {...task,acceptedFindings:saved.events?.length??task.acceptedFindings??0,
  validationIssues:task.validationIssues?.length?task.validationIssues:saved.issues??[],
  rejectedFindings:Array.isArray(saved.rejected)?saved.rejected.map((r,i)=>({candidateIndex:r.index??i,
   reason:r.error??r.errors?.map(e=>`${e.code}: ${e.message}`).join(' ')??'Event failed source/schema validation.',
   diagnostics:r.errors??[]})):task.rejectedFindings??[]};
}
