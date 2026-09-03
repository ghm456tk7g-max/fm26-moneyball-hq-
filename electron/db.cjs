const Database=require('better-sqlite3');
const path=require('node:path');

function openDatabase(userDataPath){
  const db=new Database(path.join(userDataPath,'moneyball-hq.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_type TEXT NOT NULL DEFAULT 'targets',
      name TEXT NOT NULL,
      club TEXT,
      position TEXT,
      age REAL,
      apps REAL,
      minutes REAL,
      goals REAL,
      assists REAL,
      rating REAL,
      value REAL,
      wage REAL,
      contract_end TEXT,
      scores_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shortlist (
      player_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const insert=db.prepare(`INSERT INTO players(dataset_type,name,club,position,age,apps,minutes,goals,assists,rating,value,wage,contract_end,scores_json,tags_json,raw_json)
    VALUES(@datasetType,@name,@club,@position,@age,@apps,@minutes,@goals,@assists,@rating,@value,@wage,@contractEnd,@scores,@tags,@raw)`);
  function replaceDataset(players,datasetType){
    const tx=db.transaction(()=>{
      const oldIds=db.prepare('SELECT id FROM players WHERE dataset_type=?').all(datasetType).map(r=>r.id);
      for(const id of oldIds) db.prepare('DELETE FROM shortlist WHERE player_id=?').run(id);
      db.prepare('DELETE FROM players WHERE dataset_type=?').run(datasetType);
      for(const p of players) insert.run({...p,datasetType,scores:JSON.stringify(p.scores),tags:JSON.stringify(p.tags||[]),raw:JSON.stringify(p.raw||{})});
    }); tx();
  }
  function listPlayers(datasetType='targets'){
    return db.prepare(`SELECT p.*, CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END shortlisted FROM players p LEFT JOIN shortlist s ON s.player_id=p.id WHERE dataset_type=? ORDER BY json_extract(scores_json,'$.moneyball') DESC`).all(datasetType).map(r=>({...r,scores:JSON.parse(r.scores_json),tags:JSON.parse(r.tags_json),raw:JSON.parse(r.raw_json),shortlisted:!!r.shortlisted}));
  }
  function toggleShortlist(id){
    const exists=db.prepare('SELECT 1 FROM shortlist WHERE player_id=?').get(id);
    if(exists) db.prepare('DELETE FROM shortlist WHERE player_id=?').run(id); else db.prepare('INSERT INTO shortlist(player_id) VALUES(?)').run(id);
    return !exists;
  }
  function getSetting(key,fallback){const r=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}
  function setSetting(key,value){db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  return {db,replaceDataset,listPlayers,toggleShortlist,getSetting,setSetting};
}
module.exports={openDatabase};
