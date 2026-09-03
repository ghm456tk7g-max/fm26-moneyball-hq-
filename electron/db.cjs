const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { playerIdentityKey } = require('./importer.cjs');

const DB_FILENAME = 'moneyball-hq.sqlite';
const SCHEMA_VERSION = 2;
const SCORE_FALLBACK = {
  performance: 50,
  value: 50,
  financial: 50,
  development: 50,
  roleFit: 50,
  confidence: 0,
  moneyball: 50
};

function safeJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function matchKey(player) {
  const name = String(player.name || '').normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  const age = Number.isFinite(player.age) ? String(player.age) : '';
  return age ? `${name}|${age}` : '';
}

function addColumnIfMissing(db, columns, definition) {
  const name = definition.split(/\s+/)[0];
  if (!columns.has(name)) db.exec(`ALTER TABLE players ADD COLUMN ${definition}`);
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_type TEXT NOT NULL DEFAULT 'targets' CHECK(dataset_type IN ('targets','squad')),
      identity_key TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      club TEXT,
      position TEXT,
      position_group TEXT NOT NULL DEFAULT 'Unknown',
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
      score_meta_json TEXT NOT NULL DEFAULT '{}',
      tags_json TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

  const columns = new Set(db.prepare('PRAGMA table_info(players)').all().map(column => column.name));
  addColumnIfMissing(db, columns, "identity_key TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, columns, "position_group TEXT NOT NULL DEFAULT 'Unknown'");
  addColumnIfMissing(db, columns, "score_meta_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, columns, 'updated_at TEXT');

  const seen = new Set();
  const legacyRows = db.prepare("SELECT id,dataset_type,name,club,position,age,identity_key FROM players WHERE identity_key='' OR identity_key IS NULL").all();
  const updateIdentity = db.prepare('UPDATE players SET identity_key=?, updated_at=COALESCE(updated_at, imported_at, CURRENT_TIMESTAMP) WHERE id=?');
  for (const row of legacyRows) {
    let identity = playerIdentityKey(row);
    const uniqueMarker = `${row.dataset_type}|${identity}`;
    if (seen.has(uniqueMarker)) identity = `${identity}|legacy-${row.id}`;
    seen.add(`${row.dataset_type}|${identity}`);
    updateIdentity.run(identity, row.id);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_players_dataset_identity
      ON players(dataset_type, identity_key) WHERE identity_key <> '';
    CREATE INDEX IF NOT EXISTS ix_players_dataset ON players(dataset_type);
    CREATE INDEX IF NOT EXISTS ix_players_position_group ON players(dataset_type, position_group);
  `);
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)').run(SCHEMA_VERSION);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

function assertHealthy(db) {
  const result = db.pragma('quick_check(1)', { simple: true });
  if (result !== 'ok') throw new Error(`SQLite-Integritätsprüfung fehlgeschlagen: ${result}`);
}

function openDatabase(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const databasePath = path.join(userDataPath, DB_FILENAME);
  const db = new Database(databasePath, { timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    assertHealthy(db);
    db.transaction(() => migrate(db))();
  } catch (error) {
    db.close();
    throw error;
  }

  const insert = db.prepare(`
    INSERT INTO players(
      dataset_type,identity_key,name,club,position,position_group,age,apps,minutes,goals,assists,rating,value,wage,
      contract_end,scores_json,score_meta_json,tags_json,raw_json,updated_at
    ) VALUES(
      @datasetType,@identityKey,@name,@club,@position,@positionGroup,@age,@apps,@minutes,@goals,@assists,@rating,@value,@wage,
      @contractEnd,@scores,@scoreMeta,@tags,@raw,CURRENT_TIMESTAMP
    )
  `);
  const update = db.prepare(`
    UPDATE players SET identity_key=@identityKey,name=@name,club=@club,position=@position,position_group=@positionGroup,
      age=@age,apps=@apps,minutes=@minutes,goals=@goals,assists=@assists,rating=@rating,value=@value,wage=@wage,
      contract_end=@contractEnd,scores_json=@scores,score_meta_json=@scoreMeta,tags_json=@tags,raw_json=@raw,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=@id
  `);

  function serialized(player, datasetType) {
    return {
      ...player,
      datasetType,
      identityKey: player.identityKey || playerIdentityKey(player),
      positionGroup: player.positionGroup || 'Unknown',
      scores: JSON.stringify(player.scores || SCORE_FALLBACK),
      scoreMeta: JSON.stringify({ ...(player.scoreMeta || {}), positionGroups: player.positionGroups || [] }),
      tags: JSON.stringify(Array.isArray(player.tags) ? player.tags : []),
      raw: JSON.stringify(player.raw || {})
    };
  }

  function replaceDataset(players, datasetType) {
    if (!['targets', 'squad'].includes(datasetType)) throw new Error('Ungültiger Datensatztyp.');
    if (!Array.isArray(players) || !players.length) throw new Error('Ein leerer Import ersetzt keine vorhandenen Daten.');
    const transaction = db.transaction(() => {
      const existing = db.prepare('SELECT id,name,club,position,age,identity_key FROM players WHERE dataset_type=?').all(datasetType);
      const byIdentity = new Map(existing.map(row => [row.identity_key, row]));
      const byMatch = new Map();
      for (const row of existing) {
        const key = matchKey(row);
        if (!key) continue;
        if (byMatch.has(key)) byMatch.set(key, null);
        else byMatch.set(key, row);
      }

      const usedIds = new Set();
      for (const player of players) {
        const values = serialized(player, datasetType);
        const exact = byIdentity.get(values.identityKey);
        const fallback = matchKey(player) ? byMatch.get(matchKey(player)) : null;
        const current = exact && !usedIds.has(exact.id) ? exact : fallback && !usedIds.has(fallback.id) ? fallback : null;
        if (current) {
          update.run({ ...values, id: current.id });
          usedIds.add(current.id);
        } else {
          const id = Number(insert.run(values).lastInsertRowid);
          usedIds.add(id);
        }
      }

      const deletePlayer = db.prepare('DELETE FROM players WHERE id=?');
      for (const current of existing) {
        if (!usedIds.has(current.id)) deletePlayer.run(current.id);
      }
    });
    transaction();
  }

  function hydratePlayer(row) {
    if (!row) return null;
    const scoreMeta = safeJson(row.score_meta_json, {});
    const tags = safeJson(row.tags_json, []);
    return {
      ...row,
      positionGroup: row.position_group || 'Unknown',
      positionGroups: Array.isArray(scoreMeta.positionGroups) ? scoreMeta.positionGroups : [],
      scores: { ...SCORE_FALLBACK, ...safeJson(row.scores_json, SCORE_FALLBACK) },
      scoreMeta,
      tags: Array.isArray(tags) ? tags : [],
      raw: safeJson(row.raw_json, {}),
      shortlisted: Boolean(row.shortlisted)
    };
  }

  function listPlayers(datasetType = 'targets') {
    if (!['targets', 'squad'].includes(datasetType)) throw new Error('Ungültiger Datensatztyp.');
    return db.prepare(`
      SELECT p.*, CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END shortlisted
      FROM players p
      LEFT JOIN shortlist s ON s.player_id=p.id
      WHERE dataset_type=?
      ORDER BY CASE WHEN json_valid(scores_json) THEN COALESCE(json_extract(scores_json,'$.moneyball'), 0) ELSE 0 END DESC,
        name COLLATE NOCASE ASC
    `).all(datasetType).map(hydratePlayer);
  }

  function getPlayer(id) {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const row = db.prepare(`
      SELECT p.*, CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END shortlisted
      FROM players p LEFT JOIN shortlist s ON s.player_id=p.id WHERE p.id=?
    `).get(id);
    return hydratePlayer(row);
  }

  function toggleShortlist(id) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Ungültige Spieler-ID.');
    const player = db.prepare("SELECT id FROM players WHERE id=? AND dataset_type='targets'").get(id);
    if (!player) throw new Error('Der Spieler wurde nicht gefunden.');
    const exists = db.prepare('SELECT 1 FROM shortlist WHERE player_id=?').get(id);
    if (exists) db.prepare('DELETE FROM shortlist WHERE player_id=?').run(id);
    else db.prepare('INSERT INTO shortlist(player_id) VALUES(?)').run(id);
    return !exists;
  }

  function getSetting(key, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? safeJson(row.value, fallback) : fallback;
  }

  function setSetting(key, value) {
    db.prepare(`
      INSERT INTO settings(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, JSON.stringify(value));
  }

  async function backupTo(destination) {
    await db.backup(destination);
    const backup = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      assertHealthy(backup);
    } finally {
      backup.close();
    }
    return destination;
  }

  function close() {
    if (db.open) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } finally {
        db.close();
      }
    }
  }

  return { db, databasePath, replaceDataset, listPlayers, getPlayer, toggleShortlist, getSetting, setSetting, backupTo, close };
}

function validateDatabaseFile(filePath) {
  const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(candidate);
    const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!tables.has('players') || !tables.has('settings')) throw new Error('Die Datei ist kein gültiges FM26-MONEYBALL-HQ-Backup.');
    return true;
  } finally {
    candidate.close();
  }
}

module.exports = { DB_FILENAME, SCHEMA_VERSION, openDatabase, validateDatabaseFile };
