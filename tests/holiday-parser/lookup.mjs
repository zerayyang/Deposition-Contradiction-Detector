// Local Canada/BC dataset experiment. Not imported by production scoring.
import Holidays from 'date-holidays';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const normalize=value=>value.toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
const additions=JSON.parse(await readFile(new URL('./canadian-additions.json',import.meta.url),'utf8'));
const calendar=new Holidays('CA','BC',{languages:'en'});
export function lookupHoliday(name,year) {
    const base={input:name,country:'CA',province:'BC',year:year??null,usedForScoring:false};
    if(typeof name!=='string'||!name.trim())return {...base,status:'INVALID_NAME',matches:[]};
    if(year===null||year===undefined)return {...base,status:'YEAR_REQUIRED',matches:[]};
    if(!Number.isInteger(year)||year<1000||year>9999)return {...base,status:'INVALID_YEAR',matches:[]};
    const matches=calendar.getHolidays(year).filter(h=>normalize(h.name)===normalize(name)).map(h=>({
        name:h.name,localDateTime:h.date,type:h.type,rule:h.rule,source:'date-holidays CA/BC'
    }));
    if(!matches.length){
        for(const entry of additions.filter(h=>normalize(h.name)===normalize(name))){
            matches.push({name:entry.name,localDateTime:`${year}-${entry.monthDay} 00:00:00`,
                type:entry.type,rule:entry.monthDay,source:'application Canadian additions',
                notice:'Calendar date only; midnight is a calendar marker, not a stated event time.'});
        }
    }
    return {...base,status:matches.length?'FOUND':'NOT_IN_DATASET',matches};
}
async function main() {
    const args=process.argv.slice(2);
    let year,names;
    if(args.length){
        if(!/^\d{4}$/.test(args[0]))throw new Error('Usage: node tests/holiday-parser/lookup.mjs YEAR ["Holiday name" ...]');
        year=Number(args[0]);names=args.slice(1);
    }else year=2026; // Demonstration year, never testimony or current-year inference.
    if(!names?.length)names=["New Year's Eve","New Year's Day",'Canada Day','British Columbia Day','Thanksgiving','Christmas Day'];
    const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
    const rows=names.map(name=>lookupHoliday(name,year));
    const report={createdAt:new Date().toISOString(),package:'date-holidays',version:lock.packages?.['node_modules/date-holidays']?.version,
        country:'CA',province:'BC',year,yearSource:args.length?'explicit CLI argument':'demonstration only',
        notice:'Local dataset lookup only. Missing holiday is not evidence that the occasion does not exist. No year, transcript event, observed-date interpretation or conflict is inferred.',rows};
    console.log(`CANADA / BRITISH COLUMBIA — ${year}; ${report.yearSource}; no Claude calls.`);
    console.table(rows.map(r=>({name:r.input,status:r.status,date:r.matches.map(m=>m.localDateTime).join(' | ')||'—'})));
    console.log('No year supplied to the helper:',lookupHoliday("New Year's Eve").status);
    console.log(report.notice);
    const directory=new URL('../report/',import.meta.url);await mkdir(directory,{recursive:true});
    const output=new URL('canadian-holidays.json',directory);await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(`Full diagnostic: ${fileURLToPath(output)}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
