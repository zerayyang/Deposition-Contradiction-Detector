import {parseTestimonySource} from '../testimonySource.js';
import {checkedSpeakerRoles,normalizeSpeakerLabel} from '../testimonyMarkers.js';
export function reviewableSpeakerLabels(text){
 const index=parseTestimonySource(text);
 const labels=[...new Set(index.turns.map(t=>t.speaker).filter(Boolean))].filter(label=>{try{checkedSpeakerRoles({speakerRoles:{[label]:'WITNESS'}});return true;}catch{return false;}});
 return {labels,diagnostics:index.diagnostics};
}
export function requireSpeakerReview(text,speakerRoles){
 const roles=checkedSpeakerRoles({speakerRoles});
 for(const label of reviewableSpeakerLabels(text).labels)if(!roles.has(normalizeSpeakerLabel(label)))throw new Error(`Review the source role for speaker "${label}" before extraction. No role was guessed.`);
}
