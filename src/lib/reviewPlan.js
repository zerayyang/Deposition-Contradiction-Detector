import {analysisBody} from './analysisClient.js';
import {documentMetadata} from './documentStore.js';
import {resumableCloudJobId} from './cloudAnalysisClient.js';

// A fresh user review must never inherit an old deployment's job identity.
// Recovery is opt-in and still passes the backend's strict provenance checks.
export function reviewRequestBody(source,{caseId,local=false,resumeJobId=null,resumeCloud=false}={}) {
  const cloudJobId=resumeCloud?resumableCloudJobId(source.analysis):null;
  if(resumeCloud&&!resumeJobId&&!cloudJobId)throw new Error('This saved run cannot continue. Choose Review again to approve a fresh plan.');
  return {...analysisBody(source.texts,source.files),caseId,...(local?{}:{useApprovedMemory:true}),
    witnessTestimonyConfirmed:source.texts.map(()=>true),originalDocuments:source.files.map(documentMetadata),
    ...(resumeJobId?{resumeJobId}:{}),...(cloudJobId?{cloudJobId}:{})};
}
