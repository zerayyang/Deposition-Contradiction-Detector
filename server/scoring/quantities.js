import { SCORING_CONFIG } from './config.js';
const small={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const scales={thousand:1e3,million:1e6,billion:1e9};
const wordNames=[...Object.keys(small),'hundred',...Object.keys(scales),'a'];
const word=`(?:${wordNames.join('|')})`;
const amount=new RegExp(`\\b(?:(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:\\s+(?:hundred|thousand|million|billion))?|${word}(?:[ -]+${word})*)\\b`,'g');
function numberValue(text) {
    if(/^\d/.test(text)) {
        const m=text.match(/^([\d,]+(?:\.\d+)?)\s*(hundred|thousand|million|billion)?$/);
        return m?Number(m[1].replace(/,/g,''))*(m[2]==='hundred'?100:scales[m[2]]??1):null;
    }
    const tokens=text.split(/[ -]+/);let result=0,group=0,lastScale=Infinity,previous=null;
    for(let i=0;i<tokens.length;i++) {
        const token=tokens[i];
        if(token==='a') {if(group||!['hundred',...Object.keys(scales)].includes(tokens[i+1]))return null;group=1;}
        else if(token==='hundred') {if(group<1||group>9||previous==='hundred')return null;group*=100;}
        else if(scales[token]) {
            if(!group||scales[token]>=lastScale)return null;
            result+=group*scales[token];group=0;lastScale=scales[token];
            // 'a billion five' is colloquial/ambiguous, not an exact 1,000,000,005.
            if(i+1<tokens.length&&!tokens.slice(i+1).some(t=>t==='hundred'||scales[t]))return null;
        } else {
            const value=small[token];if(value===undefined)return null;
            if(previous&&small[previous]!==undefined&&!(small[previous]>=20&&small[previous]%10===0&&value<10))return null;
            group+=value;
        }
        previous=token;
    }
    return result+group;
}
// Spoken forms rewritten to the literal grammar below, each with one fixed meaning:
// "1230 some-odd" is approximate; "a billion five" is 1.5 billion; "tens of millions"
// is the whole 10-99 million range ("hundreds of ..." likewise 100-999).
const DIGIT={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9};
const ORDER={thousands:'thousand',millions:'million',billions:'billion'};
const decimal=(scale,d)=>`1.${DIGIT[d]??d} ${scale}`;
function spokenAmount(text){
    return text
        .replace(/^([\d,]+(?:\.\d+)?)\s+some[- ]odd\b/,'about $1')
        .replace(/^(?:a|one)\s+(billion|million)\s+(one|two|three|four|five|six|seven|eight|nine|[1-9])(?=$|\s+(?:and|or|to)\s)/,(_,scale,d)=>decimal(scale,d))
        .replace(/(\s(?:and|or|to)\s+)(?:a|one)\s+(billion|million)\s+(one|two|three|four|five|six|seven|eight|nine|[1-9])$/,(_,bridge,scale,d)=>bridge+decimal(scale,d))
        .replace(/^(tens|hundreds) of (thousands|millions|billions)\b/,(_,size,order)=>size==='tens'?`10 to 99 ${ORDER[order]}`:`100 to 999 ${ORDER[order]}`);
}
// Supported literal amounts only. Other unknown orders of magnitude, malformed
// grouping, unsupported shorthand and unbounded values return null.
export function parseQuantityRange(phrase,config=SCORING_CONFIG) {
    let text=spokenAmount(String(phrase??'').toLowerCase().trim().replace(/[.!?]$/,''));
    if(!text||/\b(?:am|pm|january|february|march|april|may|june|july|august|september|october|november|december|tens|hundreds|thousands|millions|billions|over|under|at least|at most|more than|less than|some-odd)\b/.test(text)||/[/%:]/.test(text)||/^[-−]/.test(text))return null;
    for(const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g))if(m[0].includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m[0]))return null;
    const approximate=/\b(?:about|around|roughly|approximately|maybe|nearly|close to)\b|\bor so\b/.test(text);
    // A leading "exactly"/"precisely" restates an exact amount; mixed with an approximation it is ambiguous.
    if(/^(?:exactly|precisely)\s+/.test(text)){if(approximate)return null;text=text.replace(/^(?:exactly|precisely)\s+/,'');}
    text=text.replace(/^(?:(?:about|around|roughly|approximately|maybe|nearly|close to|between|from)\s+)*/,'').replace(/\s+or so$/,'');
    const currency=text.match(/^(usd|cad|us\$|c\$|\$)\s*/)?.[0]??'';
    text=text.slice(currency.length);
    text=text.replace(/\bhundred and (?=zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/g,'hundred ');
    const matches=[...text.matchAll(amount)];
    if(!matches.length||matches.length>2||matches[0].index!==0)return null;
    const values=matches.map(m=>numberValue(m[0]));
    if(values.some(n=>n===null||!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER))return null;
    if(matches.length===2) {
        const bridge=text.slice(matches[0][0].length,matches[1].index).trim();
        if(!/^(?:or|to|and|[-–—])$/.test(bridge))return null;
        const firstScale=matches[0][0].match(/\b(thousand|million|billion)$/)?.[1];
        const secondScale=matches[1][0].match(/\b(thousand|million|billion)$/)?.[1];
        if(firstScale&&!secondScale)return null;
        if(bridge==='and'&&!/\bbetween\b/.test(String(phrase).toLowerCase())&&matches.some(m=>/^[a-z]/.test(m[0])))return null;
        const suffix=matches[1][0].match(/\b(thousand|million|billion)$/)?.[1];
        // Explicit terminal scale applies to an unscaled numeric range endpoint.
        if(suffix&&/^[\d,.]+$/.test(matches[0][0]))values[0]*=scales[suffix];
    }
    const tail=text.slice(matches.at(-1).index+matches.at(-1)[0].length).trim();
    if(tail&&!/^[a-z]+(?:[ -][a-z]+)*$/.test(tail))return null;
    if(/\b(?:and|or|to|some|odd|point)\b/.test(tail))return null;
    if(values.some(n=>!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER))return null;
    const earliest=Math.min(...values),latest=Math.max(...values);
    const width=approximate?Math.max(config.quantityToleranceMinimum,latest*config.quantityToleranceFraction):0;
    const unit=[currency.trim(),tail].filter(Boolean).join(' ');
    return {earliest:Math.max(0,earliest-width),latest:latest+width,widenedBy:width,unit};
}
