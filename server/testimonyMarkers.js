// Recognize transcript labels without changing a single source character.
// Bare labels require a printed line number and uppercase Q/A: an ordinary
// unnumbered sentence beginning "A ..." is not an answer marker.
export function testimonyMarkers(text) {
  const markers=new Map();
  for(const m of text.matchAll(/^[ \t]*(?:\d+[ \t]+)?(QUESTION|ANSWER|Q|A)[ \t]*[.:][ \t]*/gim)) {
    markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role:/^(Q|QUESTION)$/i.test(m[1])?'Q':'A'});
  }
  for(const m of text.matchAll(/^[ \t]*\d+[ \t]+([QA])(?=[ \t]|\r?$)[ \t]*/gm)) {
    if(!markers.has(m.index))markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role:m[1]});
  }
  // Explicit speaker turns end the preceding answer/question. Objections and
  // court/counsel remarks must never be swallowed by the last witness answer.
  for(const m of text.matchAll(/^[ \t]*(?:\d+[ \t]+)?((?:MR|MS|MRS|DR)\.[ \t]+[^:\n]+|THE[ \t]+(?:COURT|WITNESS|CLERK|REPORTER)|(?:COUNSEL|JUDGE|BAILIFF|COURT REPORTER)):[ \t]*/gim)) {
    if(!markers.has(m.index))markers.set(m.index,{index:m.index,contentStart:m.index+m[0].length,role:/^THE\s+WITNESS$/i.test(m[1])?'A':'S'});
  }
  return [...markers.values()].sort((a,b)=>a.index-b.index);
}
