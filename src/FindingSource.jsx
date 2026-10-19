import {sourceBindingMessage, locateQuote} from './lib/sourceStatus.js';

// Center the highlighted quote inside its transcript box, without moving the page.
function jumpToQuote(details) {
  const pre = details?.querySelector('pre'), hit = pre?.querySelector('mark');
  if (pre && hit) pre.scrollTop = Math.max(0, hit.offsetTop - pre.clientHeight / 2 + hit.offsetHeight / 2);
}

export default function FindingSource({number,claim,binding,references=[],text,file,onDownload}) {
  // Saved references are displayed as saved; no fuzzy search or guessed location.
  const location = references.map(ref => Number.isInteger(ref.pdfPage) ? `PDF page ${ref.pdfPage}` :
    Number.isInteger(ref.start)&&Number.isInteger(ref.end) ? `Text characters ${ref.start}–${ref.end}` : '').filter(Boolean).join(' · ');
  // The quote is highlighted only where its exact words are found in the transcript.
  const found = text && claim?.original ? locateQuote(text, claim.original, [...references, binding?.selected]) : null;
  return <section className="finding-source" aria-label={`Transcript ${number} source`}>
    <strong>{file?.name ?? `Transcript ${number} · pasted text`}</strong>
    <p>{location || 'Exact source location unavailable.'}</p>
    {binding?.status !== 'BOUND' && <p className="source-location-warning">{sourceBindingMessage(binding)} Review the full transcript below; no location has been guessed.</p>}
    <details onToggle={event => { const details = event.currentTarget; if (details.open) requestAnimationFrame(() => jumpToQuote(details)); }}><summary>View full transcript {number}</summary>
      <p className="muted">{file?'Extracted transcript text. Download the saved original to check its formatting.':'Original pasted transcript text.'} {found ? 'The quote is highlighted.' : 'The quote could not be matched word for word; use your browser’s Find to search.'}</p>
      {found && <button type="button" className="source-jump-button" onClick={event => jumpToQuote(event.currentTarget.closest('details'))}>Jump to quote</button>}
      {text ? <pre tabIndex={0} aria-label={`Full transcript ${number}`}>{found ? <>{text.slice(0, found.start)}<mark className="source-quote-mark">{text.slice(found.start, found.end)}</mark>{text.slice(found.end)}</> : text}</pre> : <p>Full text is unavailable in this saved case.</p>}
    </details>
    {file?.path && onDownload && <button type="button" className="source-original-button" onClick={onDownload}>Download original {file.type==='application/pdf'?'PDF':'file'} ↗</button>}
    {!file?.path && <small>No original file was saved with this transcript.</small>}
    {!claim?.original && <small>No finding quotation was saved.</small>}
  </section>;
}
