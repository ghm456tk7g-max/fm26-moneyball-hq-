const { parentPort, workerData } = require('node:worker_threads');
const { importFile } = require('./importer.cjs');
const { scoreDataset } = require('./scoring.cjs');

try {
  const parsed = importFile(workerData.filePath, workerData.datasetType);
  const scored = scoreDataset(parsed.players);
  parentPort.postMessage({
    ok: true,
    result: {
      scored,
      sourceRowCount: parsed.sourceRowCount,
      duplicateCount: parsed.duplicateCount,
      warnings: parsed.warnings,
      map: parsed.map,
      encoding: parsed.encoding,
      delimiter: parsed.delimiter
    }
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error || 'Unbekannter Importfehler')
  });
}
