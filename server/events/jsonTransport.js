// Recognize one whole-response Markdown wrapper, never repair JSON or quotations.
// Raw provider content remains in the task audit; schema/source validation is unchanged.
export function decodeEventJson(raw) {
 const text=raw.trim();
 const fenced=/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
 const format=fenced?'MARKDOWN_JSON_FENCE':'BARE_JSON';
 try{return {value:JSON.parse(fenced?fenced[1]:text),format};}
 catch{throw new Error('Invalid event JSON: response format is unreadable. Original response retained; no repair was attempted.');}
}
