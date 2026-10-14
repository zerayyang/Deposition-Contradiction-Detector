import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { textFromPdfItems, extractPdfText } from "./pdfText.js";

test("preserves question/answer lines across split PDF text runs", () => {
  const item = (str, x, y, width, hasEOL = false) => ({ str, transform: [1,0,0,1,x,y], width, hasEOL });
  assert.equal(textFromPdfItems([item("Q:",0,100,10),item("Where?",15,100,30,true),item("A:",0,80,10),item("At home.",15,80,40,true)]), "Q: Where?\nA: At home.");
});
test("real sample PDFs extract six complete Q/A pairs with the shipped parser", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const name of ["riley-morgan-first-deposition.pdf", "riley-morgan-second-deposition.pdf"]) {
    const bytes = new Uint8Array(await readFile(new URL(`../../public/examples/${name}`, import.meta.url)));
    const text = await extractPdfText(bytes, pdfjs);
    assert.equal((text.match(/^Q:/gm) ?? []).length, 6);
    assert.equal((text.match(/^A:/gm) ?? []).length, 6);
    assert.match(text, /Elena Ruiz/);
    assert.match(text, /October 12, 2025/);
  }
});
test("rejects scanned/empty pages instead of silently omitting evidence and destroys task", async () => {
  let destroyed = false;
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }), destroy: async () => { destroyed = true; } }) };
  await assert.rejects(extractPdfText(new Uint8Array(), pdfjs), /run OCR first/);
  assert.equal(destroyed, true);
});
test("reports password protection without proceeding to upload", async () => {
  const error = Object.assign(new Error("password required"), { name: "PasswordException" });
  const pdfjs = { getDocument: () => ({ promise: Promise.reject(error), destroy: async () => {} }) };
  await assert.rejects(extractPdfText(new Uint8Array(), pdfjs), /password protected/);
});
