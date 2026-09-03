const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../electron/db.cjs');
const { importFile } = require('../electron/importer.cjs');
const { scoreDataset, transferDecision } = require('../electron/scoring.cjs');

test('FM export flows through import, scoring, persistence, shortlist and decision', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moneyball-flow-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const exportPath = path.join(directory, 'targets.csv');
  const rows = ['Name;Club;Position;Age;Minutes;Goals;Assists;Av Rat;Value;Wage'];
  rows.push('Prime Target;FC Value;ST;20;1800;20;9;7,50;€10K;€250');
  for (let index = 0; index < 8; index += 1) {
    rows.push(`Peer ${index};FC ${index};ST;${25 + index};1500;${2 + index};${1 + Math.floor(index / 2)};${String((6.4 + index * 0.08).toFixed(2)).replace('.', ',')};€${30 + index * 5}K;€${600 + index * 70}`);
  }
  fs.writeFileSync(exportPath, `${rows.join('\n')}\n`, 'utf8');

  const parsed = importFile(exportPath, 'targets');
  const scored = scoreDataset(parsed.players);
  const store = openDatabase(path.join(directory, 'user data with spaces ä'));
  // Close SQLite before the parent temp directory cleanup on Windows.
  t.after(() => store.close());
  store.replaceDataset(scored, 'targets');

  const target = store.listPlayers('targets').find(player => player.name === 'Prime Target');
  assert.ok(target);
  assert.ok(target.scores.confidence >= 75);
  assert.equal(store.toggleShortlist(target.id), true);
  assert.equal(store.getPlayer(target.id).shortlisted, true);

  const decision = transferDecision(target, 65000, 1000);
  assert.equal(decision.affordable, true);
  assert.ok(['BUY', 'CONSIDER'].includes(decision.verdict));
  assert.ok(decision.firstYearCost > target.value);
});
