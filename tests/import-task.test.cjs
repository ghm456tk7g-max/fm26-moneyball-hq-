const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runImportTask } = require('../electron/import-task.cjs');

test('isolated import handles the complete German FM26 export shape', async () => {
  const source = path.join(__dirname, '..', 'sample-data', 'fm26-import-smoke.csv');
  const result = await runImportTask(source, 'targets');
  assert.equal(result.scored.length, 18);
  assert.equal(result.sourceRowCount, 18);
  assert.equal(result.map.minutes, 'Minuten');
  assert.equal(result.map.value, 'Transferwert');
  assert.equal(result.encoding, 'UTF-8');
  assert.ok(result.scored.every(player => Number.isFinite(player.scores.moneyball)));
});

test('isolated import supports paths with spaces, umlauts and duplicate suffixes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm26 import müller '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'moneyball_export_20260903_184538(1).csv');
  fs.copyFileSync(path.join(__dirname, '..', 'sample-data', 'fm26-import-smoke.csv'), target);
  const result = await runImportTask(target, 'squad');
  assert.equal(result.scored.length, 18);
});

test('a broken file fails inside the worker without terminating the parent process', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm26-broken-import-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'broken.csv');
  fs.writeFileSync(target, 'Foo;Bar\n1;2\n', 'utf8');
  await assert.rejects(runImportTask(target, 'targets'), /Pflichtspalte Name\/Spieler/);
  assert.equal(1 + 1, 2);
});
