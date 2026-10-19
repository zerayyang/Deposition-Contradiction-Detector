import {sourceBindingMessage} from './lib/sourceStatus.js';

export default function FindingSource({number,claim,binding,references=[],text,file,onDownload}) {
  // Saved references are displayed as saved; no fuzzy search or guessed location.
  const location = references.map(ref => Number.isInteger(ref.pdfPage) ? `PDF page ${ref.pdfPage}` :
    Number.isInteger(ref.start)&&Number.isInteger(ref.end) ? `Text characters ${ref.start}–${ref.end}` : '').filter(Boolean).join(' · ');
  return <section className="finding-source" aria-label={`Transcript ${number} source`}>
    <strong>{file?.name ?? `Transcript ${number} · pasted text`}</strong>
    <p>{location || 'Exact source location unavailable.'}</p>
    {binding?.status !== 'BOUND' && <p className="source-location-warning">{sourceBindingMessage(binding)} Review the full transcript below; no location has been guessed.</p>}
    <details><summary>View full transcript {number}</summary>
      <p className="muted">{file?'Extracted transcript text. Download the saved original to check its formatting.':'Original pasted transcript text.'} Use your browser’s Find to search the document.</p>
      {text ? <pre tabIndex={0} aria-label={`Full transcript ${number}`}>{text}</pre> : <p>Full text is unavailable in this saved case.</p>}
    </details>
    {file?.path && onDownload && <button type="button" className="source-original-button" onClick={onDownload}>Download original {file.type==='application/pdf'?'PDF':'file'} ↗</button>}
    {!file?.path && <small>No original file was saved with this transcript.</small>}
    {!claim?.original && <small>No finding quotation was saved.</small>}
  </section>;
}
