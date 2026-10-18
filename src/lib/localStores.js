import { checkFileBudget } from "../../shared/documentLimits.js";
import { documentMetadata } from "./documentStore.js";

// No-account mode for a computer running the app itself (localhost, no Supabase
// configured). Cases, transcripts, results and original files stay in this browser's
// IndexedDB on this computer. Hosted sites never qualify: see localModeEnabled.
export const LOCAL_USER_ID = "local-development";
export const LOCAL_SESSION = Object.freeze({ local: true, user: Object.freeze({ id: LOCAL_USER_ID, email: "this computer" }) });

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export function isLocalHost(hostname) { return LOOPBACK.has(String(hostname ?? "").toLowerCase()); }
export function localModeEnabled({ supabaseConfigured, hostname }) { return !supabaseConfigured && isLocalHost(hostname); }

// Minimal key-value store over IndexedDB; tests pass an in-memory replacement.
export function indexedDbKv(name = "deposition-local") {
  let opened;
  const db = () => opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("This browser blocked local storage. Allow site storage and try again."));
  });
  const run = async (mode, work) => {
    const store = (await db()).transaction("kv", mode).objectStore("kv");
    return new Promise((resolve, reject) => { const request = work(store); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  };
  return {
    get: key => run("readonly", store => store.get(key)),
    put: (key, value) => run("readwrite", store => store.put(value, key)),
    delete: key => run("readwrite", store => store.delete(key)),
    keys: async prefix => (await run("readonly", store => store.getAllKeys())).filter(key => String(key).startsWith(prefix)),
  };
}

const columns = row => ({ id: row.id, owner_id: row.owner_id, title: row.title, created_at: row.created_at });

export function createLocalCaseStore(kv, { randomId = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const key = id => `case:${id}`;
  async function existing(id) { const row = await kv.get(key(id)); if (!row) throw new Error("Case not found on this computer."); return row; }
  return {
    async list() {
      const rows = await Promise.all((await kv.keys("case:")).map(k => kv.get(k)));
      return rows.filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map(columns);
    },
    async get(id) { return structuredClone(await existing(id)); },
    async save(id, draft) {
      const row = await existing(id);
      await kv.put(key(id), { ...row,
        transcript1: draft.texts[0], transcript2: draft.texts[1],
        results: draft.results === null ? null : { findings: draft.results, elapsedSeconds: draft.seconds, ...(draft.analysis ? { analysis: draft.analysis } : {}) },
        review_notes: { notes: draft.notes, reviewed: draft.reviewed, documents: [0, 1].map(index => documentMetadata(draft.files?.[index])) } });
      return { id };
    },
    async remove(id) {
      if (!id || id === "sample") throw new Error("Select a saved case to delete.");
      await existing(id); await kv.delete(key(id)); return { id };
    },
    async rename(id, value) {
      const title = String(value ?? "").trim();
      if (!id || id === "sample") throw new Error("Save this case before renaming it.");
      if (!title || title.length > 200) throw new Error("Enter a case name between 1 and 200 characters.");
      const row = await existing(id); row.title = title; await kv.put(key(id), row); return columns(row);
    },
    async create(value) {
      const title = value.trim();
      if (!title || title.length > 200) throw new Error("Enter a case name between 1 and 200 characters.");
      const row = { id: randomId(), owner_id: LOCAL_USER_ID, title, created_at: now(), transcript1: "", transcript2: "", results: null, review_notes: null };
      await kv.put(key(row.id), row); return columns(row);
    },
  };
}

export function createLocalDocumentStore(kv, randomId = () => crypto.randomUUID()) {
  const prefix = caseId => {
    if (!caseId || caseId === "sample" || caseId.includes("/")) throw new Error("Save this case before uploading an original file.");
    return `${LOCAL_USER_ID}/${caseId}/`;
  };
  const ownPath = (path, caseId) => {
    if (typeof path !== "string" || !path.startsWith(prefix(caseId)) || path.includes("..")) throw new Error("This file does not belong to the selected case.");
    return path;
  };
  return {
    async upload(caseId, file, options = {}) {
      const extension = file.name?.match(/\.(pdf|txt|md)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error("Choose a .pdf, .txt or .md transcript.");
      checkFileBudget(file);
      options.signal?.throwIfAborted();
      const path = `${prefix(caseId)}${randomId()}.${extension}`;
      const type = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : "text/plain";
      if (await kv.get(`file:${path}`)) throw new Error("A file with this identifier already exists.");
      await kv.put(`file:${path}`, { blob: file, type });
      return { path, name: file.name, size: file.size, type };
    },
    async download(caseId, file) {
      const stored = await kv.get(`file:${ownPath(file.path, caseId)}`);
      if (!stored) throw new Error("The original file is not stored in this browser.");
      return stored.blob;
    },
    async remove(caseId, file) { if (file?.path) await kv.delete(`file:${ownPath(file.path, caseId)}`); },
    async removeCaseFiles(caseId) { for (const k of await kv.keys(`file:${prefix(caseId)}`)) await kv.delete(k); },
  };
}
