import { DOCUMENT_LIMITS,checkFileBudget } from '../../shared/documentLimits.js';
import { uploadResumable } from './resumableUpload.js';
export const DOCUMENT_BUCKET = "case-originals";
export const MAX_DOCUMENT_BYTES = DOCUMENT_LIMITS.fileBytes;

export function documentMetadata(file) {
  return file?.path ? { path: file.path, name: file.name, size: file.size, type: file.type, ...(file.extraction?{extraction:file.extraction}:{}), ...(file.pageMappingStale?{pageMappingStale:true}:{}) } : null;
}

export function createDocumentStore(client, userId, randomId = () => crypto.randomUUID()) {
  const bucket = () => client.storage.from(DOCUMENT_BUCKET);
  const casePrefix = caseId => {
    if (!caseId || caseId === "sample" || caseId.includes("/")) throw new Error("Save this case before uploading an original file.");
    return `${userId}/${caseId}/`;
  };
  function ownPath(path, caseId) {
    if (typeof path !== "string" || !path.startsWith(casePrefix(caseId)) || path.includes("..")) throw new Error("This file does not belong to the selected case.");
    return path;
  }
  return {
    async upload(caseId, file, options = {}) {
      const prefix = casePrefix(caseId);
      const extension = file.name?.match(/\.(pdf|txt|md)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error("Choose a .pdf, .txt or .md transcript.");
      checkFileBudget(file);
      options.signal?.throwIfAborted();
      const path = `${prefix}${randomId()}.${extension}`;
      const type = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : "text/plain";
      // Upload the original File bytes, not the editable extracted transcript.
      if(file.size>6*1024*1024 || options.signal) await uploadResumable(client,path,file,type,options);
      else {
        const { error } = await bucket().upload(path, file, { contentType: type, upsert: false, ...(options.signal?{signal:options.signal}:{}) });
        if (error) throw error;
      }
      return { path, name: file.name, size: file.size, type };
    },
    async download(caseId, file) {
      const { data, error } = await bucket().download(ownPath(file.path, caseId));
      if (error) throw error;
      if (!data) throw new Error("The original file could not be downloaded.");
      return data;
    },
    async remove(caseId, file) {
      if (!file?.path) return;
      const { error } = await bucket().remove([ownPath(file.path, caseId)]);
      if (error) throw error;
    },
    async removeCaseFiles(caseId) {
      const prefix = casePrefix(caseId);
      const paths = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket().list(prefix.slice(0, -1), { limit: 1000, offset });
        if (error) throw error;
        for (const entry of data ?? []) if (entry.id) paths.push(`${prefix}${entry.name}`);
        if (!data || data.length < 1000) break;
      }
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await bucket().remove(paths.slice(offset, offset + 100));
        if (error) throw error;
      }
    },
  };
}
