// Literal calendar collection only: no current date, synthetic reference or model metadata.
const months='january february march april may june july august september october november december'.split(' ');
const datePattern=new RegExp(`\\b(?:(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})|(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?|new year['’]s (eve|day)(?:,?\\s+(\\d{4}))?)\\b`,'gi');
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>`${d.year}/${d.month}/${d.day}`;
export function collectDates(text='') {
    return [...String(text).matchAll(datePattern)].map(m=>{
        const year=m[1]??m[6]??m[8]??'';
        const month=m[2]?Number(m[2]):m[4]?months.indexOf(m[4].toLowerCase())+1:m[7].toLowerCase()==='eve'?12:1;
        const day=Number(m[3]??m[5]??(m[7].toLowerCase()==='eve'?31:1));
        // Leap-year 2000 is a validation bound for an unspecified year, not an inferred year.
        const maxDay=new Date(Date.UTC(Number(year||2000),month,0)).getUTCDate();
        const valid=month>=1&&month<=12&&day>=1&&day<=maxDay&&(!year||Number(year)>=1000);
        return {original:m[0],index:m.index,year,month:pad(month),day:pad(day),valid,
            source:m[7]?'explicit named occasion':'explicit calendar date'};
    });
}
export function stripDates(text) {
    return String(text??'').replace(datePattern,' ');
}
export function dateScope(text) {
    const dates=collectDates(text);
    if(!dates.length)return {present:false,key:null};
    const keys=new Set(dates.filter(d=>d.valid).map(dateKey));
    return {present:true,key:dates.every(d=>d.valid)&&keys.size===1?[...keys][0]:null};
}
export function collectTemporal(fact) {
    const original=String(fact.original??'');
    const dates=[...collectDates(fact.context??'').map(d=>({...d,provenance:'source question'})),
        ...collectDates(original).map(d=>({...d,provenance:'witness quote'}))];
    const clocks=[];
    // Do not mistake a bare day, quantity or synthetic Chrono hour for an explicit clock.
    const timeText=String(fact.time??'');
    const withoutDates=stripDates(timeText);
    const pattern=/\b(midnight|noon)\b|\b(\d{1,2})(?::([0-5]\d))?\s*([ap]\s*\.?\s*m\.?)|\b(\d{1,2}):([0-5]\d)\b/gi;
    for(const m of withoutDates.matchAll(pattern)){
        let hour='',minute,hour12='';
        if(m[1]){hour=m[1].toLowerCase()==='midnight'?'00':'12';minute='00';}
        else {
            const raw=Number(m[2]??m[5]),period=m[4]?.toLowerCase().replace(/[.\s]/g,'');
            minute=m[3]??m[6]??'';
            if(period){if(raw<1||raw>12)continue;hour=pad(raw%12+(period==='pm'?12:0));}
            else if(raw===0||raw>12&&raw<=23)hour=pad(raw);
            else if(raw>=1&&raw<=12)hour12=pad(raw);
            else continue;
        }
        clocks.push({original:m[0].trim(),hour,minute,hour12,provenance:'validated time phrase'});
    }
    const scope=dateScope(`${fact.context??''} ${original}`);
    const date=scope.key?dates.find(d=>d.valid&&dateKey(d)===scope.key):null;
    // One recognized token in a longer range/bound is not a point-time assertion.
    const structured=/\b(?:between|from|until|through|before|after|since|by|earlier|later)\b|\d\s*(?:to|-)\s*\d/i.test(timeText)
        || /\b(?:before|after|until|since|no earlier|no later)\b/i.test(fact.sourceStatement??original);
    const clock=clocks.length===1&&!structured?clocks[0]:null;
    const fields={year:date?.year??'',month:date?.month??'',day:date?.day??'',hour:clock?.hour??'',minute:clock?.minute??''};
    return {fields,display:`${fields.year}/${fields.month}/${fields.day} ${fields.hour}/${fields.minute}`,
        dates,clocks,structuredTime:structured,kind:'calendar scope and clock components, not an absolute timestamp',format:'YYYY/MM/DD HH/mm',
        notice:'Blank means unstated or unresolved. Multiple dates/clocks remain separate. A named midnight supplies 00/00; a holiday alone supplies no event time. Matching dates do not prove event identity.'};
}
