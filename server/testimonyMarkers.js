// Preserve source offsets. Speaker roles are caller-supplied metadata, never
// taken from a model claim. Unknown named turns are boundaries, not testimony.
export const normalizeSpeakerLabel=label=>label.trim().replace(/\s+/g,' ').toUpperCase();
const courtRole=/^(?:THE\s+(?:COURT|CLERK|REPORTER)|COUNSEL|JUDGE|BAILIFF|COURT REPORTER)$/i;
export function checkedSpeakerRoles(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Source options must be an object.');
  const roles=options.speakerRoles===undefined?{}:options.speakerRoles;
  if(!roles||typeof roles!=='object'||Array.isArray(roles)||![Object.prototype,null].includes(Object.getPrototypeOf(roles)))throw new TypeError('speakerRoles must be a caller-supplied label-to-role object.');
  const result=new Map();
  for(const [label,role] of Object.entries(roles)) {
    const key=normalizeSpeakerLabel(label);
    if(!key||/[\r\n:]/.test(label)||!['WITNESS','QUESTIONER','OTHER'].includes(role))throw new TypeError('Invalid speaker label or role.');
    if(courtRole.test(key)&&role!=='OTHER')throw new TypeError('Court and officer labels cannot be witness/questioner mappings.');
    if(/^(?:Q|A|QUESTION|ANSWER|THE WITNESS)$/.test(key))throw new TypeError('Reserved transcript labels cannot be remapped.');
    if(result.has(key)&&result.get(key)!==role)throw new TypeError('Conflicting roles for the same speaker label.');
    result.set(key,role);
  }
  return result;
}
export function testimonyMarkers(text,options={}) {
  const roles=checkedSpeakerRoles(options),markers=new Map();
  // Punctuated labels retain existing case-insensitive behavior.
  for(const m of text.matchAll(/^[ \t]*(?:\d+[ \t]+)?(QUESTION|ANSWER|Q|A)[ \t]*[.:][ \t]*/gim)) {
    markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role:/^(Q|QUESTION)$/i.test(m[1])?'Q':'A'});
  }
  // Bare labels require a printed line number and uppercase Q/A.
  for(const m of text.matchAll(/^[ \t]*\d+[ \t]+([QA])(?=[ \t]|\r?$)[ \t]*/gm)) {
    if(!markers.has(m.index))markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role:m[1]});
  }
  // Colon labels only. Recognize existing courtroom labels, uppercase names,
  // name-like title case labels, and exact caller-declared labels. No surname
  // expansion, fuzzy matching, inferred gender, or guessed witness identity.
  for(const m of text.matchAll(/^[ \t]*(?:\d+[ \t]+)?([^:\r\n]{1,100}):[ \t]*/gm)) {
    const label=m[1].trim(),key=normalizeSpeakerLabel(label);
    // An initial in a named label (A. Reed:) is not an A. answer marker.
    // Preserve ordinary Q/A syntax unless this is an exact declared label or
    // the specific initial-plus-name form.
    if(markers.has(m.index)&&!roles.has(key)&&!(/^[QA]\.[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*$/u.test(label)))continue;
    const known=/^(?:(?:MR|MS|MRS|DR)\.[ \t]+.+|THE[ \t]+(?:COURT|WITNESS|CLERK|REPORTER)|COUNSEL|JUDGE|BAILIFF|COURT REPORTER)$/i.test(label);
    const upper=/^[\p{Lu}][\p{Lu}\p{M} .'’-]*$/u.test(label);
    const name=/^[\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*)*$/u.test(label);
    if(!known&&!upper&&!name&&!roles.has(key))continue;
    const mapped=roles.get(key);
    const role=key==='THE WITNESS'?'A':mapped==='WITNESS'?'A':mapped==='QUESTIONER'?'Q':'S';
    const roleKnown=Boolean(mapped||known);
    markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role,speaker:label,
      speakerKey:key,roleOrigin:mapped?'CALLER_METADATA':key==='THE WITNESS'?'EXPLICIT_WITNESS':known?'COURTROOM_LABEL':'UNRESOLVED',roleKnown});
  }
  return [...markers.values()].sort((a,b)=>a.index-b.index);
}
