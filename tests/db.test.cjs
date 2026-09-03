const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDatabase, SCHEMA_VERSION, validateDatabaseFile } = require('../electron/db.cjs');
const { playerIdentityKey } = require('../electron/importer.cjs');
const { scoreDataset } = require('../electron/scoring.cjs');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moneyball-db-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function scoredPlayer(overrides = {}) {
  const raw = {
    name: 'Alex Doe', club: 'FC A', position: 'ST', age: 22, apps: 20, minutes: 1400,
    goals: 12, assists: 5, rating: 7.2, value: 15000, wage: 300, contractEnd: '2028', raw: {},
    ...overrides
  };
  raw.identityKey = playerIdentityKey(raw);
  return scoreDataset([raw])[0];
}

test('creates the database in user data with migrations and safety pragmas', t => {
  const directory = temporaryDirectory(t);
  const store = openDatabase(directory);
  t.after(() => store.close());
  assert.equal(store.databasePath, path.join(directory, 'moneyball-hq.sqlite'));
  assert.ok(fs.existsSync(store.databasePath));
  assert.equal(store.db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  assert.equal(store.db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(store.db.pragma('journal_mode', { simple: true }).toLowerCase(), 'wal');
});

test('replacement is transactional and empty imports cannot erase existing data', t => {
  const store = openDatabase(temporaryDirectory(t));
  t.after(() => store.close());
  store.replaceDataset([scoredPlayer()], 'targets');
  assert.throws(() => store.replaceDataset([], 'targets'), /leer/);
  assert.equal(store.listPlayers('targets').length, 1);
});

test('shortlist survives a repeated import and a unique player club update', t => {
  const store = openDatabase(temporaryDirectory(t));
  t.after(() => store.close());
  store.replaceDataset([scoredPlayer()], 'targets');
  const original = store.listPlayers('targets')[0];
  assert.equal(store.toggleShortlist(original.id), true);

  store.replaceDataset([scoredPlayer({ club: 'FC B' })], 'targets');
  const updated = store.listPlayers('targets')[0];
  assert.equal(updated.id, original.id);
  assert.equal(updated.club, 'FC B');
  assert.equal(updated.shortlisted, true);
});

test('removed players cascade out of shortlist and squad players cannot be shortlisted', t => {
  const store = openDatabase(temporaryDirectory(t));
  t.after(() => store.close());
  store.replaceDataset([scoredPlayer()], 'targets');
  const target = store.listPlayers('targets')[0];
  store.toggleShortlist(target.id);
  store.db.prepare('DELETE FROM players WHERE id=?').run(target.id);
  assert.equal(store.db.prepare('SELECT COUNT(*) count FROM shortlist').get().count, 0);

  store.replaceDataset([scoredPlayer({ name: 'Squad Player' })], 'squad');
  const squad = store.listPlayers('squad')[0];
  assert.throws(() => store.toggleShortlist(squad.id), /nicht gefunden/);
  assert.throws(() => store.toggleShortlist(-1), /Ungültige/);
});

test('invalid stored JSON is contained instead of crashing the player list', t => {
  const store = openDatabase(temporaryDirectory(t));
  t.after(() => store.close());
  store.replaceDataset([scoredPlayer()], 'targets');
  store.db.prepare("UPDATE players SET scores_json='broken', tags_json='broken', raw_json='broken'").run();
  const player = store.listPlayers('targets')[0];
  assert.equal(player.scores.confidence, 0);
  assert.equal(player.scores.moneyball, 50);
  assert.deepEqual(player.tags, []);
  assert.deepEqual(player.raw, {});
});

test('settings parsing falls back safely and persists valid settings across restarts', t => {
  const directory = temporaryDirectory(t);
  let store = openDatabase(directory);
  store.setSetting('club', { transferBudget: 50000, maxWeeklyWage: 800, formation: '4-2-3-1' });
  store.close();
  store = openDatabase(directory);
  assert.equal(store.getSetting('club', {}).transferBudget, 50000);
  store.db.prepare("UPDATE settings SET value='not-json' WHERE key='club'").run();
  assert.deepEqual(store.getSetting('club', { safe: true }), { safe: true });
  store.close();
});

test('creates an integrity-checked backup that can be reopened', async t => {
  const directory = temporaryDirectory(t);
  const store = openDatabase(directory);
  t.after(() => store.close());
  store.replaceDataset([scoredPlayer()], 'targets');
  const backupPath = path.join(directory, 'backup.sqlite');
  await store.backupTo(backupPath);
  assert.equal(validateDatabaseFile(backupPath), true);
  const backup = new Database(backupPath, { readonly: true });
  assert.equal(backup.prepare('SELECT COUNT(*) count FROM players').get().count, 1);
  backup.close();
});

test('rejects files that are SQLite databases but not application backups', t => {
  const directory = temporaryDirectory(t);
  const wrongPath = path.join(directory, 'wrong.sqlite');
  const wrong = new Database(wrongPath);
  wrong.exec('CREATE TABLE unrelated(id INTEGER)');
  wrong.close();
  assert.throws(() => validateDatabaseFile(wrongPath), /kein gültiges/);
});

test('migrates the original schema without losing players or shortlist', t => {
  const directory = temporaryDirectory(t);
  const legacyPath = path.join(directory, 'moneyball-hq.sqlite');
  const legacy = new Database(legacyPath);
  legacy.exec(`
    CREATE TABLE players (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dataset_type TEXT NOT NULL DEFAULT 'targets', name TEXT NOT NULL,
      club TEXT, position TEXT, age REAL, apps REAL, minutes REAL, goals REAL, assists REAL, rating REAL,
      value REAL, wage REAL, contract_end TEXT, scores_json TEXT NOT NULL, tags_json TEXT NOT NULL,
      raw_json TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE shortlist (player_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO players(dataset_type,name,club,position,age,scores_json,tags_json,raw_json)
      VALUES('targets','Legacy Player','Old FC','ST',23,'{"moneyball":70}','[]','{}');
    INSERT INTO shortlist(player_id) VALUES(1);
  `);
  legacy.close();

  const store = openDatabase(directory);
  t.after(() => store.close());
  const migrated = store.listPlayers('targets')[0];
  assert.equal(migrated.name, 'Legacy Player');
  assert.equal(migrated.shortlisted, true);
  assert.ok(migrated.identity_key);
  assert.equal(store.db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
});
