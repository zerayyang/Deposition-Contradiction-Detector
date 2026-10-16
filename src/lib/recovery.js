export async function recoveryRequest(fetchImpl,path,options={}) {
 const response=await fetchImpl(`/api/analysis/jobs${path}`,options),data=await response.json();
 if(!response.ok)throw new Error(data.error??'Recovery could not be loaded.');return data;
}
export function recoveredDraft(current,record) {
 if(!record.result)throw new Error('No completed checkpoint is available yet. Original documents are still saved.');
 const key=f=>JSON.stringify([f.type,f.claim1?.original,f.claim2?.original,f.sourceReferences??null]);
 const previous=new Map((current.results??[]).map((f,i)=>[key(f),i]));const results=record.result.contradictions??[],notes={},reviewed={};
 for(const [i,f] of results.entries()){const old=previous.get(key(f));if(old!==undefined){if(current.notes?.[old])notes[i]=current.notes[old];if(current.reviewed?.[old])reviewed[i]=current.reviewed[old];}}
 const running=record.state==='running';
 return {...current,texts:record.texts,files:record.originalDocuments??current.files,results,analysis:{...record.result.analysis,jobId:record.id,status:running?'running':record.result.analysis.status==='running'?'interrupted':record.result.analysis.status,interruption:record.notice??record.result.analysis.interruption},seconds:Number.isFinite(record.result.analysis?.timing?.elapsedMs)?record.result.analysis.timing.elapsedMs/1000:current.seconds,notes,reviewed,selected:0,dirty:true};
}

export function beginAnalysisDraft(current,resuming=false){
 return resuming?current:{...current,results:null,analysis:null,notes:{},reviewed:{},selected:0};
}
