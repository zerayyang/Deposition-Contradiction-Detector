const types=new Set(['DIRECT','INFERENTIAL','FALSE_POSITIVE']);
const decisions=new Set(['APPROVE','REJECT','NEEDS_CONTEXT','REVOKE']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value,label){if(typeof value!=='string'||!uuid.test(value))throw new Error(`${label} must be a UUID.`);return value;}
function note(value){if(typeof value!=='string'||!value.trim()||value.length>4000)throw new Error('Add a nonblank explanation, up to 4,000 characters.');return value;}
function only(input,fields){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw new Error('Unsupported feedback fields. Scores, ownership and approval state cannot be supplied.');}
function errorMessage(error){
 if(['42P01','42883','PGRST202','PGRST205'].includes(error.code))return new Error('Review storage is not installed yet. Apply the Stage 6–8 database migrations before using this feature.');
 return new Error(error.message??'Feedback could not be saved. Your detector result was not changed.');
}
// An audit convenience only. Database authorization is authoritative.
export function latestFeedbackDecision(feedbackId,rows){return rows.filter(d=>d.feedback_id===feedbackId).reduce((latest,row)=>!latest||row.revision>latest.revision?row:latest,null);}
export function activeFeedbackExamples(examples,decisionRows,{historyComplete=false}={}){if(!historyComplete)throw new Error('Complete decision history is required; a partial page can hide revocation.');return examples.filter(e=>{const latest=latestFeedbackDecision(e.feedback_id,decisionRows);return latest?.decision==='APPROVE'&&latest.id===e.decision_id;});}
export function createFeedbackStore(client){
 if(!client?.rpc||!client?.from)throw new Error('An authenticated Supabase client is required.');
 async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw errorMessage(error);return data;}
 async function page(table,column,value,{offset=0,limit=50}={}){
  id(value,column);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid feedback page.');
  const {data,error}=await client.from(table).select('*').eq(column,value).order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+limit);
  if(error)throw errorMessage(error);const rows=data??[];return {rows:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null};
 }
 return {
  async submit(input){
   only(input,['caseId','findingIndex','finding','proposedType','rationale','requestId','supersedesId']);
   if(!types.has(input.proposedType)||!Number.isSafeInteger(input.findingIndex)||input.findingIndex<0||!input.finding||typeof input.finding!=='object'||Array.isArray(input.finding))throw new Error('Select a saved finding and a valid proposed category.');
   if(new TextEncoder().encode(JSON.stringify(input.finding)).length>1048576)throw new Error('Finding snapshot exceeds the feedback storage budget; nothing was truncated.');
   return rpc('submit_finding_feedback',{p_case_id:id(input.caseId,'Case ID'),p_finding_index:input.findingIndex,p_expected_finding:structuredClone(input.finding),p_proposed_type:input.proposedType,p_rationale:note(input.rationale),p_request_id:id(input.requestId,'Request ID'),p_supersedes_id:input.supersedesId?id(input.supersedesId,'Previous feedback ID'):null});
  },
  async review(input){
   only(input,['feedbackId','decision','rationale','sourceChecked','expectedDecisionId']);
   if(!decisions.has(input.decision)||typeof input.sourceChecked!=='boolean'||input.decision==='APPROVE'&&!input.sourceChecked)throw new Error('Approval requires an explicit source check and a valid decision.');
   return rpc('review_finding_feedback',{p_feedback_id:id(input.feedbackId,'Feedback ID'),p_decision:input.decision,p_rationale:note(input.rationale),p_source_checked:input.sourceChecked,p_expected_decision_id:input.expectedDecisionId?id(input.expectedDecisionId,'Previous decision ID'):null});
  },
  async releaseMemory(input){
   only(input,['exampleId','enabled','lesson','searchTerms','notEvaluationMaterial']);
   if(typeof input.enabled!=='boolean'||input.notEvaluationMaterial!==true||typeof input.lesson!=='string'||!input.lesson.trim()||input.lesson.length>1500||!Array.isArray(input.searchTerms)||input.searchTerms.length<1||input.searchTerms.length>16||input.searchTerms.some(t=>typeof t!=='string'||t.trim().length<2||t.length>60||!/[\p{L}\p{N}]/u.test(t)))throw new Error('Provide a general lesson, 1–16 search terms and confirm this is not evaluation material.');
   return rpc('release_feedback_memory',{p_example_id:id(input.exampleId,'Example ID'),p_enabled:input.enabled,p_lesson:input.lesson.trim(),p_search_terms:input.searchTerms.map(t=>t.trim()),p_not_evaluation_material:true});
  },
  reviewSources:feedbackId=>rpc('get_feedback_review_sources',{p_feedback_id:id(feedbackId,'Feedback ID')}),
  async listInbox({offset=0,limit=50}={}){
   if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid feedback page.');
   const {data,error}=await client.from('finding_feedback').select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+limit);
   if(error)throw errorMessage(error);const rows=data??[];return {rows:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null};
  },
  async reviewState(feedbackId){
   id(feedbackId,'Feedback ID');
   const {data:decisions,error}=await client.from('feedback_decisions').select('*').eq('feedback_id',feedbackId).order('revision',{ascending:false}).limit(1);
   if(error)throw errorMessage(error);const decision=decisions?.[0]??null;
   if(decision?.decision!=='APPROVE')return {decision,example:null,release:null};
   const {data:examples,error:exampleError}=await client.from('approved_feedback_examples').select('*').eq('decision_id',decision.id).limit(1);
   if(exampleError)throw errorMessage(exampleError);const example=examples?.[0]??null;
   if(!example)return {decision,example:null,release:null};
   const {data:releases,error:releaseError}=await client.from('feedback_memory_releases').select('*').eq('example_id',example.id).order('revision',{ascending:false}).limit(1);
   if(releaseError)throw errorMessage(releaseError);
   return {decision,example,release:releases?.[0]??null};
  },
  canReview:ownerId=>rpc('can_review_finding_feedback',{p_owner_id:id(ownerId,'Owner ID')}),
  listSubmissions:(caseId,options)=>page('finding_feedback','case_id',caseId,options),
  listDecisions:(feedbackId,options)=>page('feedback_decisions','feedback_id',feedbackId,options),
  listExampleHistory:(ownerId,options)=>page('approved_feedback_examples','owner_id',ownerId,options),
 };
}
