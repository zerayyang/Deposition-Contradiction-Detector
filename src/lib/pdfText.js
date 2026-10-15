import { checkTextBudget } from '../../shared/documentLimits.js';
// Preserve PDF item order and Q/A line endings; do not reinterpret testimony.
export function textFromPdfItems(items) {
  let output = '', previous = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5], x = item.transform?.[4];
    if (previous && Number.isFinite(y) && Number.isFinite(previous.y) && Math.abs(y-previous.y)>3 && !output.endsWith('\n')) output+='\n';
    if (output && !/\s$/.test(output) && !/^\s/.test(item.str) && previous && Number.isFinite(x) && x>previous.right+1) output+=' ';
    output+=item.str;
    if(item.hasEOL)output+='\n';
    previous={y,right:(x??0)+(item.width??0)};
  }
  return output.trim();
}
export async function extractPdfDocument(bytes,pdfjs,onProgress=()=>{},{signal}={}) {
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
  const abort=()=>{void task.destroy();};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    signal?.throwIfAborted();
    const pdf=await task.promise;
    const labels=typeof pdf.getPageLabels==='function'?await pdf.getPageLabels():null;
    const pages=[], texts=[]; let offset=0;
    for(let number=1;number<=pdf.numPages;number++) {
      signal?.throwIfAborted();onProgress(`Reading PDF page ${number} of ${pdf.numPages}…`);
      let page,text='',error=null;
      try{page=await pdf.getPage(number);text=textFromPdfItems((await page.getTextContent()).items);}
      catch(e){signal?.throwIfAborted();error=e.message;}
      finally{page?.cleanup?.();}
      if(number>1)offset+=2;
      pages.push({pdfPage:number,pageLabel:labels?.[number-1]??String(number),start:offset,end:offset+text.length,
        status:error?'READ_ERROR':!text.trim()?'OCR_REQUIRED':'TEXT',...(error?{error}:{}),
        ...(text.trim()&&text.length<40?{warning:'Sparse selectable text: inspect this page for missing scanned testimony.'}:{})});
      texts.push(text);offset+=text.length;
      // Running budget check is linear; never re-sum all pages.
      if(offset>12*1024*1024)checkTextBudget(texts.join('\n\n'));
    }
    const text=texts.join('\n\n');checkTextBudget(text);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    const textSha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    return {text,extraction:{version:1,textSha256,textLength:text.length,pageCount:pdf.numPages,pages,
      ocrPages:pages.filter(p=>p.status==='OCR_REQUIRED').map(p=>p.pdfPage),
      failedPages:pages.filter(p=>p.status==='READ_ERROR').map(p=>p.pdfPage)}};
  } catch(error) {
    signal?.throwIfAborted();
    if(error.name==='PasswordException')throw new Error('This PDF is password protected. Upload an unlocked copy.',{cause:error});
    if(error.name==='InvalidPDFException')throw new Error('This PDF is damaged or invalid. Export a new PDF and try again.',{cause:error});
    throw error;
  } finally{signal?.removeEventListener('abort',abort);await task.destroy();}
}
// Backward-compatible string helper; incomplete PDFs never masquerade as complete text.
export async function extractPdfText(bytes,pdfjs,onProgress,options) {
  const doc=await extractPdfDocument(bytes,pdfjs,onProgress,options);
  if(doc.extraction.ocrPages.length||doc.extraction.failedPages.length)throw new Error(`PDF pages requiring OCR or repair: ${[...doc.extraction.ocrPages,...doc.extraction.failedPages].join(', ')}. Please run OCR first; no pages were silently skipped.`);
  return doc.text;
}
