import { readFileSync } from "node:fs";
import { TestimonyFact } from "../TestimonyFact.js";
import { scoreFacts } from "./engine.js";
import { SCORING_CONFIG } from "./config.js";

const gold=JSON.parse(readFileSync(new URL("./gold.json",import.meta.url),"utf8"));
const run=(row,config=SCORING_CONFIG)=>scoreFacts(new TestimonyFact(row.claim1),new TestimonyFact(row.claim2),row.context,config);
const results=gold.map(row=>({id:row.id,expected:row.expectedBand??"UNASSIGNED",provisional:row.provisionalBand,
    actual:run(row).band,status:run(row).status,score:run(row).score,debatable:row.debatable}));
console.table(results);
const assigned=gold.filter(r=>r.expectedBand&&!r.debatable);
const hits=assigned.filter(r=>run(r).band===r.expectedBand).length;
console.log(assigned.length?`Owner-labeled band accuracy: ${hits}/${assigned.length} (${Math.round(100*hits/assigned.length)}%). Not a calibrated probability.`:"Owner-labeled accuracy: unavailable (no approved, non-debatable labels). Provisional bands are author suggestions, not ground truth.");
const baseline=gold.map(row=>run(row).band);
console.table([ [0.5,0.5],[0.4,0.6],[0.6,0.4] ].flatMap(([evidenceMix,commitmentMix])=>[30,45,60].map(timeToleranceMinutes=>{
    const config={...SCORING_CONFIG,evidenceMix,commitmentMix,timeToleranceMinutes};
    return {evidenceMix,commitmentMix,timeToleranceMinutes,bandsChanged:gold.filter((row,i)=>run(row,config).band!==baseline[i]).length};
})));
console.log("To supply owner labels, set expectedBand and set debatable:false only after reviewing each pair and its source context.");
