import {testimonyMarkers} from './testimonyMarkers.js';

// This index preserves every source character; it does not infer event meaning.
// Named witness/questioner assignments must be trusted caller metadata.
export function parseTestimonySource(text,options={}) {
  if(typeof text!=='string')throw new TypeError('Original transcript text is required.');
  const markers=testimonyMarkers(text,options),turns=[],diagnostics=[];
  let question=null,questions=[],lastWitness=null,lastAnswerEnd=0,questionAnswered=false;
  const add=(start,contentStart,end,role,extra={})=>turns.push({start,contentStart,end,role,...extra});
  if(!markers.length) {
    if(text.length)add(0,0,text.length,'WITNESS',{speaker:null,question:null,questions:[],roleOrigin:'UNLABELED_INPUT'});
    diagnostics.push({code:'UNLABELED_INPUT',start:0,end:text.length,message:'Plain text is accepted as submitted testimony; speaker identity is not established.'});
  }else{
    if(markers[0].index>0)add(0,0,markers[0].index,'UNATTRIBUTED');
    for(const [i,marker] of markers.entries()) {
      const {index:start,contentStart,speaker=null,speakerKey=null}=marker;
      const end=markers[i+1]?.index??text.length;
      const role=marker.role==='Q'?'QUESTION':marker.role==='A'?'WITNESS':'OTHER';
      if(role==='QUESTION') {
        if(question&&!questionAnswered)questions.pop();
        questionAnswered=false;
        question={start:contentStart,end,text:text.slice(contentStart,end).trim(),speaker};
        // The existing assessment consumes only its last four questions. Preserve
        // all literal Q turns, but avoid quadratic copies of the whole history.
        questions.push(question.text);questions=questions.slice(-4);
      }else if(role==='WITNESS') {
        // A newly identified witness cannot inherit the preceding witness's frame.
        const namedKey=marker.roleOrigin==='CALLER_METADATA'?speakerKey:null;
        if(namedKey&&lastWitness&&namedKey!==lastWitness) {
          question=question&&question.start>=lastAnswerEnd?question:null;
          questions=question?[question.text]:[];
        }
        if(namedKey)lastWitness=namedKey;
        lastAnswerEnd=end;
        questionAnswered=true;
        if(!question)diagnostics.push({code:'QUESTION_UNRESOLVED',start,end,message:'No uninterrupted governing question was established for this answer.'});
      }else{
        question=null;questions=[];lastWitness=null;questionAnswered=false;
        if(!marker.roleKnown)diagnostics.push({code:'UNKNOWN_SPEAKER',start,end,speaker,message:'Speaker role is unresolved; this turn is not witness evidence.'});
        else diagnostics.push({code:'CONTEXT_INTERRUPTED',start,end,speaker,message:'Non-witness speech ends the preceding question frame; no resumed question is assumed.'});
      }
      add(start,contentStart,end,role,{speaker,roleOrigin:marker.roleOrigin??'QA_LABEL',
        question:role==='WITNESS'?question:null,questions:role==='WITNESS'?[...questions]:[]});
    }
  }
  return {mode:markers.length?'LABELED':'PLAIN',turns,diagnostics,
    notice:'Speaker mappings establish source roles only, not truth, identity across documents, event meaning or confidence.'};
}
