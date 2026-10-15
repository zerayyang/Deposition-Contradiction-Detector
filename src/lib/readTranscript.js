import { extractPdfDocument } from './pdfText.js';
import { checkFileBudget,checkTextBudget } from '../../shared/documentLimits.js';
export async function readTranscriptDocument(file,onProgress,options={}) {
  checkFileBudget(file);options.signal?.throwIfAborted();
  if(!/\.pdf$/i.test(file.name)) {const text=await file.text();checkTextBudget(text);return {text,extraction:null};}
  const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
  const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  return extractPdfDocument(new Uint8Array(await file.arrayBuffer()),pdfjs,onProgress,options);
}
export async function readTranscript(file,onProgress) {
  const doc=await readTranscriptDocument(file,onProgress);
  if(doc.extraction&&(doc.extraction.ocrPages.length||doc.extraction.failedPages.length))throw new Error('Some PDF pages need OCR or repair; use the document import to review page coverage.');
  return doc.text;
}
