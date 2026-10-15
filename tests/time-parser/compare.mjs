// Local diagnostic only: no network calls and no connection to production scoring.
import * as chrono from 'chrono-node';
import { parseTimeRange } from '../../server/scoring/parsers.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A synthetic reference prevents "today" and timezone defaults changing each run.
export const reference = { instant: new Date('2026-01-15T12:00:00Z'), timezone: 0 };
export const examples = [
    '5:15', '6:45', 'around 8', 'Around 8, maybe 8:30.', '8:30 or so',
    '11:00 p.m.', '7:00 p.m. on the 12th', 'Around 10 at night',
    'between 11 and midnight', 'Probably around 11:45.',
    "I didn't leave before midnight.", 'I left around 12:30.',
    'from 11 p.m. to 1 a.m.', 'around 8. It rained at night.',
];
const fields=['year','month','day','weekday','hour','minute','second','meridiem','timezoneOffset'];
export function components(part) {
    if(!part)return null;
    return Object.fromEntries(fields.map(field=>[field,{value:part.get(field),knownByChrono:part.isCertain(field)}]));
}
export function inspect(text) {
    const matches=chrono.parse(text, reference).map(result=>({
        matchedText:result.text,index:result.index,
        start:components(result.start),end:components(result.end),
    }));
    return {input:text,currentParser:parseTimeRange(text),chronoMatches:matches,
        diagnostic:matches.length?'Inspect matched spans: Chrono may recognize only part of the phrase.':'NO MATCH: input was not repaired or discarded.'};
}
function describe(part) {
    if(!part)return '—';
    const hour=part.hour.value,minute=part.minute.value;
    const meridiem=part.meridiem;
    return `${hour??'?'}:${String(minute??'?').padStart(2,'0')} [AM/PM ${meridiem.value===null?'absent':meridiem.knownByChrono?'known by parser':'IMPLIED'}]`;
}
async function main() {
    const inputs=process.argv.slice(2).length?process.argv.slice(2):examples;
    const rows=inputs.map(inspect);
    const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
    const report={createdAt:new Date().toISOString(),chronoVersion:lock.packages?.['node_modules/chrono-node']?.version??'unavailable',
        reference:{instant:reference.instant.toISOString(),timezone:reference.timezone,synthetic:true},
        notice:'Diagnostic only. isCertain means known by Chrono, not verified testimony or a probability. Dates/AM-PM may be inferred. Approximation, negation and whole-phrase meaning are not verified. Current parser receives the same text without source-question context.',rows};
    console.log('CHRONO EXPERIMENT — local only; scoring unchanged; no Claude calls.');
    console.log(`Synthetic reference: ${report.reference.instant}; timezone UTC. Chrono ${report.chronoVersion}`);
    console.table(rows.map(row=>({input:row.input,
        current:row.currentParser?JSON.stringify(row.currentParser):'NO MATCH',
        chronoMatch:row.chronoMatches.map(m=>m.matchedText).join(' | ')||'NO MATCH',
        start:row.chronoMatches.map(m=>describe(m.start)).join(' | ')||'—',
        end:row.chronoMatches.map(m=>describe(m.end)).join(' | ')||'—'})));
    const directory=new URL('../report/',import.meta.url);
    await mkdir(directory,{recursive:true});
    const output=new URL('chrono-comparison.json',directory);
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(report.notice);
    console.log(`Full values and known/implied flags: ${fileURLToPath(output)}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
