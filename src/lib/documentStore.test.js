import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentStore, documentMetadata, DOCUMENT_BUCKET } from "./documentStore.js";

const textFile = () => new File(["Q: Where?\r\nA: Home.\r\n"], "March original.txt", { type: "text/plain" });
test("uploads original File bytes to an account/case-specific private path without overwriting", async () => {
  const file = textFile();
  const client = { storage: { from(name) {
    assert.equal(name, DOCUMENT_BUCKET);
    return { async upload(path, body, options) {
      assert.equal(path, "owner-a/case-a/file-id.txt");
      assert.equal(body, file);
      assert.deepEqual(options, { contentType: "text/plain", upsert: false });
      return {};
    } };
  } } };
  const metadata = await createDocumentStore(client, "owner-a", () => "file-id").upload("case-a", file);
  assert.deepEqual(metadata, { path: "owner-a/case-a/file-id.txt", name: file.name, size: file.size, type: "text/plain" });
});
test("rejects unsupported, empty or oversized files before making a storage request", async () => {
  const store = createDocumentStore(null, "owner-a");
  await assert.rejects(store.upload("sample", textFile()), /Save this case/);
  await assert.rejects(store.upload("case-a", { name: "image.png", size: 10 }), /\.pdf/);
  await assert.rejects(store.upload("case-a", { name: "empty.txt", size: 0 }), /non-empty/);
  await assert.rejects(store.upload("case-a", { name: "huge.txt", size: 2097153 }), /2 MB/);
});
test("download checks account and case paths and surfaces access errors", async () => {
  const store = createDocumentStore({ storage: { from: () => ({ download: async () => ({ error: new Error("access denied") }) }) } }, "owner-a");
  await assert.rejects(store.download("case-a", { path: "owner-b/case-a/file.txt" }), /does not belong/);
  await assert.rejects(store.download("case-a", { path: "owner-a/other-case/file.txt" }), /does not belong/);
  await assert.rejects(store.download("case-a", { path: "owner-a/case-a/file.txt" }), /access denied/);
});
test("metadata excludes file bodies and temporary text", () => {
  const file = { path: "owner/case/file.txt", name: "Original.txt", type: "text/plain", size: 42, text: "private content", blob: "not JSON" };
  assert.deepEqual(documentMetadata(file), { path: file.path, name: file.name, type: file.type, size: file.size });
  assert.equal(documentMetadata({ name: "old local file", text: "legacy" }), null);
});
test("case cleanup only removes objects from that owner's case folder", async () => {
  const removed = [];
  const client = { storage: { from: () => ({ list: async (prefix, options) => {
    assert.equal(prefix, "owner-a/case-a"); assert.equal(options.offset, 0);
    return { data: [{ id: "first", name: "first.txt" }, { id: "second", name: "second.md" }] };
  }, remove: async paths => { removed.push(...paths); return {}; } }) } };
  await createDocumentStore(client, "owner-a").removeCaseFiles("case-a");
  assert.deepEqual(removed, ["owner-a/case-a/first.txt", "owner-a/case-a/second.md"]);
});

test("PDF original is uploaded unchanged with application/pdf content type", async () => {
  const pdf = new File(["%PDF-1.7 test"], "original.pdf", { type: "application/pdf" });
  const client = { storage: { from: () => ({ upload: async (path, body, options) => {
    assert.equal(path, "owner-a/case-a/test-id.pdf");
    assert.equal(body, pdf);
    assert.equal(options.contentType, "application/pdf");
    return {};
  } }) } };
  const metadata = await createDocumentStore(client, "owner-a", () => "test-id").upload("case-a", pdf);
  assert.equal(metadata.type, "application/pdf");
});
