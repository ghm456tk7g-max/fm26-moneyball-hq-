const Database=require('better-sqlite3');
const path=require('node:path');
const fs=require('node:fs');
const {playerKey}=require('./importer.cjs');

function safeJson(value,fallback){try{return JSON.parse(value);}catch{return fallback;}}
function migrate(db){
  const version=db.pragma('user_version',{simple:true});
  if(version<1){
    db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dataset_type TEXT NOT NULL DEFAULT 'targets', player_key TEXT,
        name TEXT NOT NULL, club TEXT, position TEXT, age REAL, apps REAL, minutes REAL, goals REAL, assists REAL,
        rating REAL, value REAL, wage REAL, contract_end TEXT, scores_json TEXT NOT NULL, tags_json TEXT NOT NULL,
        raw_json TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS shortlist (
        player_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }
  const columns=db.pragma('table_info(players)').map(c=>c.name);
  if(!columns.includes('player_key')) db.exec('ALTER TABLE players ADD COLUMN player_key TEXT');
  const rows=db.prepare('SELECT id,name,club,position,age FROM players WHERE player_key IS NULL').all();
  const update=db.prepare('UPDATE players SET player_key=? WHERE id=?');
  db.transaction(()=>{for(const p of rows)update.run(playerKey(p),p.id);})();
  db.pragma('user_version = 2');
}
function openDatabase(userDataPath){
  fs.mkdirSync(userDataPath,{recursive:true});
  const dbPath=path.join(userDataPath,'moneyball-hq.sqlite');
  const existed=fs.existsSync(dbPath)&&fs.statSync(dbPath).size>0;
  const db=new Database(dbPath,{timeout:5000});
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  const oldVersion=db.pragma('user_version',{simple:true});
  if(existed&&oldVersion<2){
    db.pragma('wal_checkpoint(FULL)');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    fs.copyFileSync(dbPath,path.join(userDataPath,`moneyball-hq.pre-migration-${stamp}.sqlite`));
  }
  migrate(db);
  const integrity=db.pragma('quick_check',{simple:true});
  if(integrity!=='ok') throw new Error(`Datenbank-Integritätsprüfung fehlgeschlagen: ${integrity}`);
  const insert=db.prepare(`INSERT INTO players(dataset_type,player_key,name,club,position,age,apps,minutes,goals,assists,rating,value,wage,contract_end,scores_json,tags_json,raw_json)
    VALUES(@datasetType,@playerKey,@name,@club,@position,@age,@apps,@minutes,@goals,@assists,@rating,@value,@wage,@contractEnd,@scores,@tags,@raw)`);
  function replaceDataset(players,datasetType){
    if(!['targets','squad'].includes(datasetType)||!Array.isArray(players)) throw new Error('Ungültiger Datensatz.');
    const tx=db.transaction(()=>{
      const selected=new Set(db.prepare(`SELECT p.player_key FROM players p JOIN shortlist s ON s.player_id=p.id WHERE p.dataset_type=?`).all(datasetType).map(r=>r.player_key));
      db.prepare('DELETE FROM players WHERE dataset_type=?').run(datasetType);
      for(const p of players){
        const key=playerKey(p);
        const result=insert.run({...p,datasetType,playerKey:key,scores:JSON.stringify(p.scores||{}),tags:JSON.stringify(p.tags||[]),raw:JSON.stringify(p.raw||{})});
        if(selected.has(key)) db.prepare('INSERT INTO shortlist(player_id) VALUES(?)').run(result.lastInsertRowid);
      }
    });
    tx();
  }
  function listPlayers(datasetType='targets'){
    if(!['targets','squad'].includes(datasetType)) return [];
    return db.prepare(`SELECT p.*, CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END shortlisted FROM players p LEFT JOIN shortlist s ON s.player_id=p.id WHERE dataset_type=? ORDER BY CAST(json_extract(scores_json,'$.moneyball') AS INTEGER) DESC, name COLLATE NOCASE`).all(datasetType).map(r=>({...r,scores:safeJson(r.scores_json,{}),tags:safeJson(r.tags_json,[]),raw:safeJson(r.raw_json,{}),shortlisted:!!r.shortlisted}));
  }
  function toggleShortlist(id){
    if(!Number.isSafeInteger(id)||id<=0||!db.prepare("SELECT 1 FROM players WHERE id=? AND dataset_type='targets'").get(id)) throw new Error('Transferziel wurde nicht gefunden.');
    const exists=db.prepare('SELECT 1 FROM shortlist WHERE player_id=?').get(id);
    if(exists) db.prepare('DELETE FROM shortlist WHERE player_id=?').run(id); else db.prepare('INSERT INTO shortlist(player_id) VALUES(?)').run(id);
    return !exists;
  }
  function getSetting(key,fallback){const r=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return r?safeJson(r.value,fallback):fallback;}
  function setSetting(key,value){db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  function close(){if(db.open)db.close();}
  return {db,dbPath,replaceDataset,listPlayers,toggleShortlist,getSetting,setSetting,close};
}
async function createBackup(db,targetPath){
  if(!targetPath) throw new Error('Kein Backup-Ziel angegeben.');
  await db.backup(targetPath);
  return targetPath;
}
module.exports={openDatabase,createBackup,migrate};
