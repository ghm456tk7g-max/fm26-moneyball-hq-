const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger } = require('../electron/logger.cjs');

test('writes parseable diagnostics below the per-user data directory', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm26 logs müller '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const logger = createLogger(directory);
  logger.info('import-started', { fileName: 'players(1).csv', size: 1830 });
  logger.error('import-failed', new Error('controlled failure'));
  const entries = fs.readFileSync(logger.logPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].event, 'import-started');
  assert.equal(entries[1].message, 'controlled failure');
  assert.ok(logger.logPath.startsWith(directory));
});
