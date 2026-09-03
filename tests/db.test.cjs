const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Database=require('better-sqlite3');
const {openDatabase,createBackup}=require('../electron/db.cjs');

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'fm26-db-'));}
function player(overrides={}){return {name:'Alex Test',club:'Dainava',position:'ST',age:21,apps:10,minutes:900,goals:6,assists:2,rating:7.1,value:12000,wage:250,contractEnd:'2027-06-30',scores:{moneyball:75,confidence:90},tags:[],raw:{},...overrides};}

test('database initializes in user data path with migrations and persistence',()=>{
  const dir=temp();let store=openDatabase(dir);assert.equal(store.db.pragma('user_version',{simple:true}),2);
  store.replaceDataset([player()],'targets');store.setSetting('club',{transferBudget:123});store.close();
  store=openDatabase(dir);assert.equal(store.listPlayers().length,1);assert.equal(store.getSetting('club',{}).transferBudget,123);store.close();
  assert.ok(fs.existsSync(path.join(dir,'moneyball-hq.sqlite')));
});
test('an existing old schema is migrated after an automatic safety copy',()=>{
  const dir=temp(),file=path.join(dir,'moneyball-hq.sqlite');const legacy=new Database(file);
  legacy.exec(`CREATE TABLE players(id INTEGER PRIMARY KEY, dataset_type TEXT NOT NULL DEFAULT 'targets', name TEXT NOT NULL, club TEXT, position TEXT, age REAL, apps REAL, minutes REAL, goals REAL, assists REAL, rating REAL, value REAL, wage REAL, contract_end TEXT, scores_json TEXT NOT NULL, tags_json TEXT NOT NULL, raw_json TEXT NOT NULL, imported_at TEXT); CREATE TABLE shortlist(player_id INTEGER PRIMARY KEY); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); PRAGMA user_version=1;`);legacy.close();
  const store=openDatabase(dir);assert.ok(store.db.pragma('table_info(players)').some(c=>c.name==='player_key'));store.close();
  assert.ok(fs.readdirSync(dir).some(name=>name.startsWith('moneyball-hq.pre-migration-')));
});
test('shortlist survives reimport of the same player',()=>{
  const store=openDatabase(temp());store.replaceDataset([player()],'targets');const first=store.listPlayers()[0];store.toggleShortlist(first.id);
  store.replaceDataset([player({rating:7.3,scores:{moneyball:80,confidence:90}})],'targets');const again=store.listPlayers()[0];
  assert.equal(again.shortlisted,true);assert.equal(again.rating,7.3);store.close();
});
test('shortlist rejects invalid ids and foreign keys are active',()=>{
  const store=openDatabase(temp());assert.throws(()=>store.toggleShortlist(999),/nicht gefunden/);
  assert.throws(()=>store.db.prepare('INSERT INTO shortlist(player_id) VALUES(999)').run());store.close();
});
test('replacement is atomic when a row cannot be stored',()=>{
  const store=openDatabase(temp());store.replaceDataset([player()],'targets');
  assert.throws(()=>store.replaceDataset([player({name:undefined})],'targets'));
  assert.equal(store.listPlayers().length,1);store.close();
});
test('corrupt setting JSON falls back safely',()=>{
  const store=openDatabase(temp());store.db.prepare("INSERT INTO settings(key,value) VALUES('bad','{')").run();assert.deepEqual(store.getSetting('bad',{safe:true}),{safe:true});store.close();
});
test('SQLite online backup produces a readable consistent copy',async()=>{
  const store=openDatabase(temp());store.replaceDataset([player()],'targets');const target=path.join(temp(),'backup.sqlite');await createBackup(store.db,target);
  const backup=new Database(target,{readonly:true});assert.equal(backup.prepare('SELECT count(*) n FROM players').get().n,1);assert.equal(backup.pragma('quick_check',{simple:true}),'ok');backup.close();store.close();
});
