const fs=require('node:fs');
const Papa=require('papaparse');

const aliases={
  name:['name','spieler','spielername','player','player name'],age:['age','alter'],position:['position','pos','position(en)','positions'],club:['club','verein','team','klub'],
  apps:['apps','appearances','einsätze','einsatze','spiele','sp'],minutes:['minutes','mins','minuten','minute','min'],goals:['goals','g','gls','tore'],assists:['assists','a','ast','vorlagen'],
  rating:['av rat','avg rating','average rating','durchschnittsbewertung','bewertung','note','ø bewertung'],value:['value','transfer value','wert','marktwert','transferwert'],
  wage:['wage','salary','gehalt','wochengehalt','wage p/w'],contractEnd:['contract expires','contract end','expires','vertrag bis','vertragsende','vertrag endet']
};
const MISSING=/^(?:-|–|—|n\/?a|n\.a\.|null|undefined)$/i;
const MAX_IMPORT_BYTES=25*1024*1024;

function normHeader(s){return String(s||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[._]/g,' ').replace(/\s+/g,' ');}
function findColumn(headers,key){
  const lookup=headers.map(h=>[h,normHeader(h)]);
  for(const a of aliases[key]||[]) { const hit=lookup.find(([,n])=>n===a); if(hit) return hit[0]; }
  return null;
}
function parseNumber(value){
  if(value===null||value===undefined) return null;
  let s=String(value).trim().replace(/[\u00a0\s]/g,'').replace(/%/g,'');
  if(!s||MISSING.test(s)) return null;
  if(/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
  else if(s.includes(',')&&!s.includes('.')) s=s.replace(',','.');
  const cleaned=s.replace(/[^0-9.+-]/g,'');
  if(!cleaned||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null;
}
function parseMoney(value){
  if(value===null||value===undefined) return null;
  let s=String(value).trim().toUpperCase().replace(/[€£$]/g,'').replace(/[\u00a0\s]/g,'');
  if(!s||MISSING.test(s)) return null;
  let mult=1;
  const suffix=s.match(/(K|M|MIO\.?|MILLION(?:EN)?)$/i);
  if(suffix){mult=suffix[1].toUpperCase()==='K'?1000:1000000;s=s.slice(0,-suffix[0].length);}
  const n=parseNumber(s);
  return Number.isFinite(n)?Math.round(n*mult):null;
}
function decodeBuffer(buf){
  if(!buf.length) throw new Error('Die gewählte Datei ist leer.');
  if(buf.length>MAX_IMPORT_BYTES) throw new Error('Die Datei ist größer als 25 MB und kann nicht sicher importiert werden.');
  if(buf[0]===0xFF&&buf[1]===0xFE) return buf.subarray(2).toString('utf16le');
  if(buf[0]===0xFE&&buf[1]===0xFF) throw new Error('UTF-16 Big Endian wird nicht unterstützt. Bitte als UTF-8 exportieren.');
  const start=buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF?3:0;
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf.subarray(start));}
  catch{return new TextDecoder('windows-1252').decode(buf);}
}
function readText(path){
  const buf=fs.readFileSync(path);
  const text=decodeBuffer(buf);
  if(text.includes('\0')) throw new Error('Die Datei scheint binär oder beschädigt zu sein.');
  return text.replace(/^\uFEFF/,'');
}
function playerKey(p){return [p.name,p.club,p.age??'',normHeader(p.position)].map(v=>String(v).trim().toLocaleLowerCase('de-DE')).join('|');}
function importFile(path,datasetType='targets'){
  if(!['targets','squad'].includes(datasetType)) throw new Error('Ungültiger Importtyp.');
  const text=readText(path);
  if(!text.trim()) throw new Error('Die gewählte Datei enthält keine Daten.');
  const result=Papa.parse(text,{header:true,skipEmptyLines:'greedy',dynamicTyping:false,transformHeader:h=>String(h).replace(/^\uFEFF/,'').trim()});
  const headers=result.meta.fields||[];
  if(!headers.length||headers.every(h=>!String(h).trim())) throw new Error('Es konnten keine Spalten erkannt werden.');
  if(result.errors.some(e=>e.code==='UndetectableDelimiter')&&headers.length>1) throw new Error('Das Trennzeichen wurde nicht erkannt. Erwartet werden Komma, Semikolon oder Tabulator.');
  const map={}; Object.keys(aliases).forEach(k=>map[k]=findColumn(headers,k));
  if(!map.name) throw new Error('Pflichtspalte Name/Spieler wurde nicht erkannt.');
  if(!['position','minutes','rating','value','wage','goals','assists'].some(key=>map[key])) throw new Error('Neben dem Spielernamen wurde keine auswertbare Spieler- oder Finanzspalte erkannt.');
  const warnings=[];
  if(!map.position) warnings.push('Position nicht erkannt');
  if(!map.minutes) warnings.push('Minuten nicht erkannt – Confidence wird niedriger');
  if(!map.value) warnings.push('Marktwert nicht erkannt');
  if(!map.wage) warnings.push('Gehalt nicht erkannt – Transferempfehlungen bleiben vorsichtig');
  const seen=new Set(); let duplicates=0; let invalidRows=0; let invalidValues=0;
  const players=[];
  for(let i=0;i<result.data.length;i++){
    const row=result.data[i];
    const player={
      importRow:i+2,datasetType,raw:row,
      name:String(row[map.name]??'').trim(),club:map.club?String(row[map.club]??'').trim():'',position:map.position?String(row[map.position]??'').trim():'',
      age:map.age?parseNumber(row[map.age]):null,apps:map.apps?parseNumber(row[map.apps]):null,minutes:map.minutes?parseNumber(row[map.minutes]):null,
      goals:map.goals?parseNumber(row[map.goals]):null,assists:map.assists?parseNumber(row[map.assists]):null,rating:map.rating?parseNumber(row[map.rating]):null,
      value:map.value?parseMoney(row[map.value]):null,wage:map.wage?parseMoney(row[map.wage]):null,contractEnd:map.contractEnd?String(row[map.contractEnd]??'').trim():''
    };
    for(const [key,min,max] of [['age',10,70],['apps',0,1000],['minutes',0,100000],['goals',0,1000],['assists',0,1000],['rating',0,10],['value',0,10_000_000_000],['wage',0,1_000_000_000]]){
      if(Number.isFinite(player[key])&&(player[key]<min||player[key]>max)){player[key]=null;invalidValues++;}
    }
    if(!player.name){invalidRows++;continue;}
    const key=playerKey(player);
    if(seen.has(key)){duplicates++;continue;}
    seen.add(key);players.push(player);
  }
  if(!players.length) throw new Error('Die Datei enthält keine importierbaren Spielerzeilen.');
  if(duplicates) warnings.push(`${duplicates} doppelte Spielerzeile(n) übersprungen`);
  if(invalidRows) warnings.push(`${invalidRows} Zeile(n) ohne Spielernamen übersprungen`);
  if(invalidValues) warnings.push(`${invalidValues} unplausible Zahlenwert(e) als fehlend behandelt`);
  for(const error of result.errors.slice(0,3)) warnings.push(`Zeile ${error.row==null?'?':error.row+2}: ${error.message}`);
  return {players,map,warnings,rowCount:players.length,headers,delimiter:result.meta.delimiter};
}

module.exports={aliases,normHeader,parseNumber,parseMoney,decodeBuffer,playerKey,importFile};
