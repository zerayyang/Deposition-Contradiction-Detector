// Keep document order and explicit line endings; do not reinterpret testimony.
export function textFromPdfItems(items) {
  let output = "";
  let previous = null;
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5];
    if (previous && Number.isFinite(y) && Number.isFinite(previous.y) && Math.abs(y - previous.y) > 3 && !output.endsWith("\n")) output += "\n";
    const x = item.transform?.[4];
    if (output && !/\s$/.test(output) && !/^\s/.test(item.str) && previous && Number.isFinite(x) && x > previous.right + 1) output += " ";
    output += item.str;
    if (item.hasEOL) output += "\n";
    previous = { y, right: (x ?? 0) + (item.width ?? 0) };
  }
  return output.trim();
}

export async function extractPdfText(bytes, pdfjs, onProgress = () => {}) {
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error("This PDF has more than 200 pages. Split it into smaller transcripts first.");
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      onProgress(`Reading PDF page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = textFromPdfItems(content.items);
      if (!text.trim()) throw new Error(`Page ${number} has no selectable text. This PDF may be scanned or partly scanned; run OCR first so pages are not skipped.`);
      pages.push(text);
      if (pages.reduce((total, value) => total + value.length, 0) > 500000) throw new Error("This PDF contains too much text. Split it into smaller transcripts first.");
      page.cleanup();
    }
    const text = pages.join("\n\n");
    if (!text.trim()) throw new Error("No selectable text was found. Run OCR on this PDF first.");
    return text;
  } catch (error) {
    if (error.name === "PasswordException") throw new Error("This PDF is password protected. Upload an unlocked copy.", { cause: error });
    if (error.name === "InvalidPDFException") throw new Error("This PDF is damaged or invalid. Export a new PDF and try again.", { cause: error });
    throw error;
  } finally { await task.destroy(); }
}
