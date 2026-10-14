import { extractPdfText } from "./pdfText.js";

export async function readTranscript(file, onProgress) {
  if (!/\.pdf$/i.test(file.name)) return file.text();
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  // Bundle the matching worker with Vite; no CDN or external document service.
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return extractPdfText(new Uint8Array(await file.arrayBuffer()), pdfjs, onProgress);
}
