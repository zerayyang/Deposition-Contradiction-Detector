// Pure structural checks: no author files are read by the verifier.
export function validateSourceRefs(refs, row) {
  if(!refs||refs.level!==2||!/^[a-z0-9][a-z0-9_-]*$/i.test(refs.bundle_id??'')||!/^[a-f0-9]{64}$/.test(refs.proposal_sha256??''))throw new Error('Invalid Level 2 provenance');
  for(const [side,key] of [['testimony1','transcript1_text'],['testimony2','transcript2_text']]){
    const p=refs[side];
    if(!p||typeof p.source!=='string'||!p.source.trim()||typeof p.document_id!=='string'||!p.document_id.trim()||!/^[a-f0-9]{64}$/.test(p.text_sha256??'')||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||p.end-p.start!==row[key].length||typeof p.location!=='string'||!p.location.trim())throw new Error(`Invalid Level 2 ${side} reference`);
  }
}
