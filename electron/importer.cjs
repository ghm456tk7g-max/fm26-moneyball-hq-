const fs = require('node:fs');
const { TextDecoder } = require('node:util');
const Papa = require('papaparse');

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 100000;
const DATASET_TYPES = new Set(['targets', 'squad']);

const aliases = {
  name: ['name', 'spieler', 'spielername', 'player', 'player name'],
  age: ['age', 'alter'],
  position: ['position', 'positions', 'pos', 'position(en)', 'positionen', 'best position'],
  club: ['club', 'verein', 'team', 'mannschaft'],
  apps: ['apps', 'apps (sub)', 'appearances', 'appearances (sub)', 'einsätze', 'einsatze', 'eins', 'spiele'],
  minutes: ['minutes', 'mins', 'minuten', 'min', 'minutes played', 'gespielte minuten'],
  goals: ['goals', 'gls', 'tore'],
  assists: ['assists', 'ast', 'vorlagen', 'vor'],
  rating: ['av rat', 'avg rating', 'average rating', 'average rating (overall)', 'durchschnittsbewertung', 'bewertung', 'note', 'ø-note', 'ø', 'Ø'],
  value: ['value', 'transfer value', 'estimated value', 'wert', 'marktwert', 'transferwert'],
  wage: ['wage', 'wages', 'salary', 'gehalt', 'wochengehalt', 'weekly wage'],
  contractEnd: ['contract expires', 'contract expiry', 'contract end', 'expires', 'vertrag bis', 'vertragsende', 'endet']
};

function normHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim().toLocaleLowerCase('de-DE').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
}

function findColumn(headers, key) {
  const lookup = headers.map(header => [header, normHeader(header)]);
  for (const alias of aliases[key] || []) {
    const hit = lookup.find(([, normalized]) => normalized === normHeader(alias));
    if (hit) return hit[0];
  }
  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text || /^(?:-|—|\?|n\/?a|n\.a\.|unknown|unbekannt|not available)$/i.test(text)) return null;
  text = text.replace(/[\s\u00A0\u202F']/g, '').replace(/%$/, '');
  if (!/^[+-]?[0-9.,]+$/.test(text)) return null;
  const sign = text.startsWith('-') ? -1 : 1;
  text = text.replace(/^[+-]/, '');
  const dots = (text.match(/\./g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  if (dots && commas) {
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? /,/g : /\./g;
    text = text.replace(thousands, '').replace(decimal, '.');
  } else if (dots > 1) {
    if (!/^\d{1,3}(?:\.\d{3})+$/.test(text)) return null;
    text = text.replace(/\./g, '');
  } else if (commas > 1) {
    if (!/^\d{1,3}(?:,\d{3})+$/.test(text)) return null;
    text = text.replace(/,/g, '');
  } else if (dots === 1 || commas === 1) {
    const separator = dots ? '.' : ',';
    const [whole, fraction] = text.split(separator);
    const looksLikeThousands = fraction.length === 3 && whole.length <= 3;
    text = looksLikeThousands ? whole + fraction : `${whole}.${fraction}`;
  }
  const parsed = Number(text) * sign;
  return Number.isFinite(parsed) && Number.isSafeInteger(Math.trunc(parsed)) ? parsed : null;
}

function parseSingleMoney(value) {
  let text = String(value).trim().toUpperCase();
  text = text.replace(/[€£$¥]/g, '').replace(/(?:€?\/?W\.?|P\/?W|PER\s*WEEK|\/\s*WEEK|WEEKLY|P\.A\.|PER\s*ANNUM|\/\s*YEAR|ANNUAL)$/i, '').replace(/[\s\u00A0\u202F]/g, '');
  let multiplier = 1;
  const suffix = text.match(/([KMB])$/);
  if (suffix) {
    multiplier = suffix[1] === 'B' ? 1000000000 : suffix[1] === 'M' ? 1000000 : 1000;
    text = text.slice(0, -1);
  }
  const parsed = parseNumber(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const amount = parsed * multiplier;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const text = String(value).trim();
  if (!text || /^(?:-|—|\?|n\/?a|n\.a\.|unknown|unbekannt|not available|nicht verfügbar)$/i.test(text)) return null;
  const range = text.match(/^(.+?)\s*(?:–|—|\bto\b|\bbis\b|-(?=\s*[€£$¥]?\s*\d))\s*(.+)$/i);
  if (range) {
    const parsedRange = [range[1], range[2]].map(parseSingleMoney);
    return parsedRange.every(Number.isFinite) ? Math.max(...parsedRange) : null;
  }
  return parseSingleMoney(text);
}

function readText(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('Die ausgewählte Quelle ist keine Datei.');
  if (stat.size === 0) throw new Error('Die ausgewählte Datei ist leer.');
  if (stat.size > MAX_FILE_BYTES) throw new Error('Die Datei ist größer als 25 MB und kann nicht sicher importiert werden.');
  const buffer = fs.readFileSync(filePath);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return { text: buffer.subarray(2).toString('utf16le'), encoding: 'UTF-16 LE' };
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) { swapped[index - 2] = buffer[index + 1]; swapped[index - 1] = buffer[index]; }
    return { text: swapped.toString('utf16le'), encoding: 'UTF-16 BE' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
    if (text.includes('\0')) throw new Error('binary');
    return { text, encoding: buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? 'UTF-8 BOM' : 'UTF-8' };
  } catch {
    const text = new TextDecoder('windows-1252', { fatal: true }).decode(buffer);
    if (text.includes('\0')) throw new Error('Die Datei scheint keine unterstützte Textdatei zu sein.');
    return { text, encoding: 'Windows-1252' };
  }
}

function normalizeIdentityPart(value) { return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' '); }
function playerIdentityKey(player) {
  const name = normalizeIdentityPart(player.name), club = normalizeIdentityPart(player.club), age = Number.isFinite(player.age) ? String(player.age) : '';
  const fallback = !club && !age ? normalizeIdentityPart(player.position) : '';
  return [name, club, age, fallback].join('|');
}
function validNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) { const parsed = parseNumber(value); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; }
function parseAppearances(value) { const combined = String(value ?? '').trim().match(/^(\d+)\s*\((\d+)\)$/); if (combined) return Number(combined[1]) + Number(combined[2]); return validNumber(value, { min: 0, max: 200 }); }
function completeness(player) { return ['club', 'position', 'age', 'apps', 'minutes', 'goals', 'assists', 'rating', 'value', 'wage', 'contractEnd'].filter(key => player[key] !== null && player[key] !== '').length; }
function deduplicatePlayers(players) {
  const unique = new Map(); let duplicateCount = 0;
  for (const player of players) { player.identityKey = playerIdentityKey(player); const existing = unique.get(player.identityKey); if (!existing) unique.set(player.identityKey, player); else { duplicateCount += 1; if (completeness(player) > completeness(existing)) unique.set(player.identityKey, player); } }
  return { players: [...unique.values()], duplicateCount };
}

function importFile(filePath, datasetType = 'targets') {
  if (!DATASET_TYPES.has(datasetType)) throw new Error('Ungültiger Importtyp.');
  const decoded = readText(filePath);
  if (!decoded.text.trim()) throw new Error('Die ausgewählte Datei enthält keine Daten.');
  const result = Papa.parse(decoded.text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false, delimitersToGuess: [',', ';', '\t'], transformHeader: header => String(header).replace(/^\uFEFF/, '').trim() });
  const headers = result.meta.fields || [];
  if (!headers.length || (headers.length === 1 && !headers[0])) throw new Error('Die Datei enthält keine erkennbare Kopfzeile.');
  if (result.data.length > MAX_ROWS) throw new Error('Die Datei enthält mehr als 100.000 Zeilen und kann nicht sicher importiert werden.');
  const fatalParserError = result.errors.find(error => error.type === 'Quotes' || (error.code === 'UndetectableDelimiter' && headers.length !== 1));
  if (fatalParserError) throw new Error(`Die Datei ist beschädigt oder hat kein unterstütztes Trennzeichen: ${fatalParserError.message}`);
  const map = {}; Object.keys(aliases).forEach(key => { map[key] = findColumn(headers, key); });
  if (!map.name) throw new Error('Pflichtspalte Name/Spieler wurde nicht erkannt.');
  const warnings = [];
  if (!map.position) warnings.push('Position nicht erkannt');
  if (!map.minutes) warnings.push('Minuten nicht erkannt – Confidence wird niedriger');
  if (!map.rating && !map.goals && !map.assists) warnings.push('Keine Leistungsdaten erkannt – Bewertung bleibt vorsichtig');
  if (!map.value) warnings.push('Marktwert nicht erkannt');
  if (!map.wage) warnings.push('Gehalt nicht erkannt – keine positive Transferempfehlung möglich');
  const malformedRows = result.errors.filter(error => error.type === 'FieldMismatch').length;
  if (malformedRows) warnings.push(`${malformedRows} Zeile(n) mit abweichender Spaltenzahl geprüft`);
  let invalidValueCount = 0;
  const parsedPlayers = result.data.map((row, index) => {
    const rawValue = key => map[key] ? row[map[key]] : null;
    const numeric = (key, bounds) => { if (!map[key]) return null; const raw = rawValue(key), parsed = validNumber(raw, bounds); if (String(raw ?? '').trim() && parsed === null && !/^(?:-|—|\?|n\/?a|n\.a\.|unknown|unbekannt)$/i.test(String(raw).trim())) invalidValueCount += 1; return parsed; };
    const monetary = key => { if (!map[key]) return null; const raw = rawValue(key), parsed = parseMoney(raw); if (String(raw ?? '').trim() && parsed === null && !/^(?:-|—|\?|n\/?a|n\.a\.|unknown|unbekannt)$/i.test(String(raw).trim())) invalidValueCount += 1; return parsed; };
    const appearances = () => { if (!map.apps) return null; const raw = rawValue('apps'), parsed = parseAppearances(raw); if (String(raw ?? '').trim() && parsed === null) invalidValueCount += 1; return parsed; };
    return { importRow: index + 2, datasetType, raw: row, name: String(rawValue('name') || '').trim(), club: map.club ? String(rawValue('club') || '').trim() : '', position: map.position ? String(rawValue('position') || '').trim() : '', age: numeric('age', { min: 14, max: 60 }), apps: appearances(), minutes: numeric('minutes', { min: 0, max: 20000 }), goals: numeric('goals', { min: 0, max: 500 }), assists: numeric('assists', { min: 0, max: 500 }), rating: numeric('rating', { min: 1, max: 10 }), value: monetary('value'), wage: monetary('wage'), contractEnd: map.contractEnd ? String(rawValue('contractEnd') || '').trim() : '' };
  }).filter(player => player.name);
  const blankNames = result.data.length - parsedPlayers.length;
  if (blankNames) warnings.push(`${blankNames} Zeile(n) ohne Spielernamen übersprungen`);
  if (invalidValueCount) warnings.push(`${invalidValueCount} ungültige Werte als fehlend markiert`);
  const deduplicated = deduplicatePlayers(parsedPlayers);
  if (deduplicated.duplicateCount) warnings.push(`${deduplicated.duplicateCount} doppelte Spielerzeile(n) zusammengeführt`);
  if (!deduplicated.players.length) throw new Error('Es wurden keine gültigen Spielerzeilen gefunden.');
  return { players: deduplicated.players, map, warnings, rowCount: deduplicated.players.length, sourceRowCount: result.data.length, duplicateCount: deduplicated.duplicateCount, headers, delimiter: result.meta.delimiter, encoding: decoded.encoding };
}

module.exports = { MAX_FILE_BYTES, aliases, parseNumber, parseMoney, readText, playerIdentityKey, importFile };
