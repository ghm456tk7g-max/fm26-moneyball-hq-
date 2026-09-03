const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_FILE_BYTES, importFile, parseMoney, parseNumber, playerIdentityKey, readText } = require('../electron/importer.cjs');

function temporaryFile(t, name, content, encoding = 'utf8') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moneyball-import-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content, encoding);
  return filePath;
}

test('parses German and English decimal and thousands formats', () => {
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('7,21'), 7.21);
  assert.equal(parseNumber('1 234'), 1234);
  assert.equal(parseNumber("1'234"), 1234);
  assert.equal(parseNumber('1,234'), 1234);
  assert.equal(parseNumber('Infinity'), null);
  assert.equal(parseNumber('12abc'), null);
  assert.equal(parseNumber(Number.NaN), null);
});

test('parses FM currency suffixes, currencies and conservative ranges', () => {
  assert.equal(parseMoney('€12,5K'), 12500);
  assert.equal(parseMoney('£12.5K p/w'), 12500);
  assert.equal(parseMoney('1.2M'), 1200000);
  assert.equal(parseMoney('1,2M'), 1200000);
  assert.equal(parseMoney('€12K - €18K'), 18000);
  assert.equal(parseMoney('€12K-€18K'), 18000);
  assert.equal(parseMoney('750'), 750);
  assert.equal(parseMoney('-10K'), null);
  assert.equal(parseMoney('Not available'), null);
});

test('imports semicolon-separated German exports with decimal commas', t => {
  const filePath = temporaryFile(t, 'spieler.csv', '\uFEFFSpieler;Verein;Position;Alter;Minuten;Tore;Vorlagen;Bewertung;Marktwert;Gehalt\nJörg Weiß;Dainava;ST (C);21;1.234;12;5;7,21;€12,5K;€300\n');
  const result = importFile(filePath, 'targets');
  assert.equal(result.encoding, 'UTF-8 BOM');
  assert.equal(result.delimiter, ';');
  assert.equal(result.rowCount, 1);
  assert.equal(result.players[0].name, 'Jörg Weiß');
  assert.equal(result.players[0].minutes, 1234);
  assert.equal(result.players[0].rating, 7.21);
  assert.equal(result.players[0].value, 12500);
});

test('imports English tab-separated exports', t => {
  const filePath = temporaryFile(t, 'players.tsv', 'Player\tClub\tPosition\tAge\tApps (Sub)\tMins\tGls\tAst\tAv Rat\tTransfer Value\tWage\nAlex Doe\tTest FC\tAM (RL)\t24\t12 (3)\t900\t5\t7\t6.95\t€20K\t€450\n');
  const result = importFile(filePath, 'squad');
  assert.equal(result.delimiter, '\t');
  assert.equal(result.players[0].datasetType, 'squad');
  assert.equal(result.players[0].apps, 15);
  assert.equal(result.players[0].assists, 7);
});

test('falls back to Windows-1252 without corrupting names', t => {
  const prefix = Buffer.from('Spieler;Position;Minuten\nJ', 'ascii');
  const suffix = Buffer.from('rg Wei', 'ascii');
  const tail = Buffer.from(';ST;900\n', 'ascii');
  const filePath = temporaryFile(t, 'windows.csv', Buffer.concat([prefix, Buffer.from([0xf6]), suffix, Buffer.from([0xdf]), tail]));
  const decoded = readText(filePath);
  assert.equal(decoded.encoding, 'Windows-1252');
  assert.match(decoded.text, /Jörg Weiß/);
  assert.equal(importFile(filePath).players[0].name, 'Jörg Weiß');
});

test('deduplicates repeated rows and keeps the more complete record', t => {
  const filePath = temporaryFile(t, 'duplicates.csv', 'Name;Club;Age;Position;Minutes;Value;Wage\nSame Player;FC A;22;ST;900;;\nSame Player;FC A;22;ST;900;10K;200\n');
  const result = importFile(filePath);
  assert.equal(result.rowCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.players[0].value, 10000);
  assert.ok(result.warnings.some(warning => warning.includes('doppelte')));
});

test('keeps partial players but marks invalid values as missing', t => {
  const filePath = temporaryFile(t, 'partial.csv', 'Name;Position;Age;Minutes;Rating;Value\nPartial;ST;not-an-age;-4;99;unknown\n');
  const result = importFile(filePath);
  assert.equal(result.players[0].age, null);
  assert.equal(result.players[0].minutes, null);
  assert.equal(result.players[0].rating, null);
  assert.equal(result.players[0].value, null);
  assert.ok(result.warnings.some(warning => warning.includes('ungültige Werte')));
});

test('accepts a one-column partial export and warns instead of inventing data', t => {
  const filePath = temporaryFile(t, 'names.txt', 'Name\nOnly Name\n');
  const result = importFile(filePath);
  assert.equal(result.rowCount, 1);
  assert.equal(result.players[0].minutes, null);
  assert.ok(result.warnings.length >= 4);
});

test('rejects empty, binary, oversized and unmappable files', t => {
  assert.throws(() => importFile(temporaryFile(t, 'empty.csv', '')), /leer/);
  assert.throws(() => importFile(temporaryFile(t, 'binary.csv', Buffer.from([0, 1, 2, 3]))), /Textdatei|Kopfzeile/);
  assert.throws(() => importFile(temporaryFile(t, 'wrong.csv', 'Foo;Bar\n1;2\n')), /Pflichtspalte/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moneyball-large-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const large = path.join(directory, 'large.csv');
  fs.closeSync(fs.openSync(large, 'w'));
  fs.truncateSync(large, MAX_FILE_BYTES + 1);
  assert.throws(() => importFile(large), /25 MB/);
});

test('player identity is stable across casing and whitespace', () => {
  assert.equal(
    playerIdentityKey({ name: ' Alex  Doe ', club: 'FC A', age: 22, position: 'ST' }),
    playerIdentityKey({ name: 'alex doe', club: 'fc a', age: 22, position: 'ST (C)' })
  );
});

test('rejects invalid dataset types', t => {
  const filePath = temporaryFile(t, 'players.csv', 'Name\nA\n');
  assert.throws(() => importFile(filePath, 'other'), /Importtyp/);
});
