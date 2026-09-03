const fs=require('node:fs');
const Papa=require('papaparse');

const aliases={
  name:['name','spieler','player'],age:['age','alter'],position:['position','pos','position(en)'],club:['club','verein','team'],
  apps:['apps','appearances','einsätze','einsatze','spiele'],minutes:['minutes','mins','minuten','min'],goals:['goals','tore'],assists:['assists','vorlagen'],
  rating:['av rat','avg rating','average rating','durchschnittsbewertung','bewertung','note'],value:['value','transfer value','wert','marktwert'],
  wage:['wage','salary','gehalt','wochengehalt'],contractEnd:['contract expires','contract end','vertrag bis','vertragsende']
};

function normHeader(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');}
function findColumn(headers,key){
  const lookup=headers.map(h=>[h,normHeader(h)]);
  for(const a of aliases[key]||[]) { const hit=lookup.find(([,n])=>n===a); if(hit) return hit[0]; }
  return null;
}
function parseNumber(value){
  if(value===null||value===undefined||value==='') return null;
  let s=String(value).trim().replace(/\s/g,'').replace(/%/g,'');
  if(!s) return null;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
  else if(s.includes(',')&&!s.includes('.')) s=s.replace(',','.');
  const n=Number(s.replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?n:null;
}
function parseMoney(value){
  if(value===null||value===undefined||value==='') return null;
  let s=String(value).trim().toUpperCase().replace(/[€£$]/g,'').replace(/\s/g,'');
  let mult=1;
  if(/[KM]$/.test(s)){mult=s.endsWith('M')?1000000:1000;s=s.slice(0,-1);}
  const n=parseNumber(s);
  return Number.isFinite(n)?Math.round(n*mult):null;
}
function readText(path){
  const buf=fs.readFileSync(path);
  if(buf[0]===0xFF&&buf[1]===0xFE) return buf.toString('utf16le');
  return buf.toString('utf8').replace(/^\uFEFF/,'');
}
function importFile(path,datasetType='targets'){
  const text=readText(path);
  const result=Papa.parse(text,{header:true,skipEmptyLines:'greedy',dynamicTyping:false,transformHeader:h=>String(h).trim()});
  if(result.errors.length&&(!result.data||!result.data.length)) throw new Error(result.errors[0].message||'CSV konnte nicht gelesen werden.');
  const headers=result.meta.fields||[];
  const map={}; Object.keys(aliases).forEach(k=>map[k]=findColumn(headers,k));
  if(!map.name) throw new Error('Pflichtspalte Name/Spieler wurde nicht erkannt.');
  const warnings=[];
  if(!map.position) warnings.push('Position nicht erkannt');
  if(!map.minutes) warnings.push('Minuten nicht erkannt – Confidence wird niedriger');
  if(!map.value) warnings.push('Marktwert nicht erkannt');
  const players=result.data.map((row,i)=>({
    importRow:i+2,datasetType,raw:row,
    name:String(row[map.name]||'').trim(),club:map.club?String(row[map.club]||'').trim():'',position:map.position?String(row[map.position]||'').trim():'',
    age:map.age?parseNumber(row[map.age]):null,apps:map.apps?parseNumber(row[map.apps]):null,minutes:map.minutes?parseNumber(row[map.minutes]):null,
    goals:map.goals?parseNumber(row[map.goals]):null,assists:map.assists?parseNumber(row[map.assists]):null,rating:map.rating?parseNumber(row[map.rating]):null,
    value:map.value?parseMoney(row[map.value]):null,wage:map.wage?parseMoney(row[map.wage]):null,contractEnd:map.contractEnd?String(row[map.contractEnd]||'').trim():''
  })).filter(p=>p.name);
  return {players,map,warnings,rowCount:players.length,headers};
}

module.exports={aliases,parseNumber,parseMoney,importFile};
