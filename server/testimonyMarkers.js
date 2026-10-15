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
  return [...markers.values()].sort((a,b)=>a.index-b.index);
}
