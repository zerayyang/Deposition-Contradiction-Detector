// In-memory fixture generator: no real deposition, external dependency or network.
export function syntheticPdf(pageTexts,{firstLabel=1}={}) {
  const objects=['<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /D /St '+firstLabel+' >>] >> >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const refs=[];
  const escape=s=>s.replace(/([\\()])/g,'\\$1');
  for(const text of pageTexts){
    const page=objects.length+1,content=page+1;refs.push(page+' 0 R');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    const stream=`BT /F1 4 Tf 40 750 Td 5 TL\n${text.split('\n').map(line=>`(${escape(line)}) Tj T*`).join('\n')}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Kids [${refs.join(' ')}] /Count ${refs.length} >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
