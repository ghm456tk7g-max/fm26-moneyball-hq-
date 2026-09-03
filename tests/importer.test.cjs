const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseNumber,parseMoney,decodeBuffer,importFile}=require('../electron/importer.cjs');

function fixture(name,content,encoding='utf8'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fm26-import-'));
  const file=path.join(dir,name);fs.writeFileSync(file,content,encoding);return file;
}
test('parses German and English decimal formats without inventing invalid values',()=>{
  assert.equal(parseNumber('1.234,5'),1234.5);assert.equal(parseNumber('1,234.5'),1234.5);assert.equal(parseNumber('7,21'),7.21);
  for(const value of ['', '-', 'N/A', 'abc', null]) assert.equal(parseNumber(value),null);
});
test('parses FM currencies and suffixes',()=>{
  assert.equal(parseMoney('€12,5K'),12500);assert.equal(parseMoney('£12.5K'),12500);assert.equal(parseMoney('$1.2M'),1200000);
  assert.equal(parseMoney('1,2 Mio.'),1200000);assert.equal(parseMoney('€500'),500);assert.equal(parseMoney('—'),null);
});
test('imports comma, semicolon and tab separated exports',()=>{
  const cases=[['a.csv','Name,Position,Minutes,Value\nA,ST,900,5K'],['a.txt','Spieler;Pos;Minuten;Marktwert\nÄnne;DC;1.234;12,5K'],['a.tsv','Player\tPosition\tMins\tWage\nB\tGK\t450\t€500']];
  for(const [name,data] of cases){const result=importFile(fixture(name,data));assert.equal(result.rowCount,1);assert.ok(result.players[0].name);}
});
test('supports UTF-8 BOM and falls back to Windows-1252',()=>{
  const bom=Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),Buffer.from('Spieler;Verein\nJörg;Köln')]);
  assert.match(decodeBuffer(bom),/Jörg/);
  const cp1252=Buffer.from('Spieler;Verein;Position\nJörg;Köln;ST','latin1');
  const file=fixture('cp1252.csv',cp1252);assert.equal(importFile(file).players[0].name,'Jörg');
});
test('deduplicates rows and reports skipped data',()=>{
  const result=importFile(fixture('dup.csv','Name,Club,Age,Position\nA,X,20,ST\nA,X,20,ST\n,X,22,CM'));
  assert.equal(result.rowCount,1);assert.ok(result.warnings.some(w=>w.includes('doppelte')));assert.ok(result.warnings.some(w=>w.includes('Spielernamen')));
});
test('invalid ranges become missing data and produce a warning',()=>{
  const result=importFile(fixture('ranges.csv','Name,Age,Minutes,Av Rat,Value,Wage\nA,-2,-90,99,-5,-1'));
  const p=result.players[0];assert.equal(p.age,null);assert.equal(p.minutes,null);assert.equal(p.rating,null);assert.equal(p.value,null);assert.equal(p.wage,null);
  assert.ok(result.warnings.some(w=>w.includes('unplausible')));
});
test('rejects empty, binary and missing-name files clearly',()=>{
  assert.throws(()=>importFile(fixture('empty.csv','')),/leer/);
  assert.throws(()=>importFile(fixture('binary.csv',Buffer.from([0,1,2]))),/binär|beschädigt/);
  assert.throws(()=>importFile(fixture('wrong.csv','Foo,Bar\n1,2')),/Pflichtspalte/);
  assert.throws(()=>importFile(fixture('names.csv','Name\nA\nB')),/auswertbare/);
});
