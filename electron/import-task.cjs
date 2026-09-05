const path = require('node:path');
const { Worker } = require('node:worker_threads');

function runImportTask(filePath, datasetType, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(path.join(__dirname, 'import-worker.cjs'), {
      workerData: { filePath, datasetType },
      resourceLimits: { maxOldGenerationSizeMb: 512 }
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const timer = setTimeout(() => {
      void worker.terminate();
      finish(reject, new Error('Der Import hat das Zeitlimit von zwei Minuten überschritten. Die vorhandenen Daten wurden nicht verändert.'));
    }, timeoutMs);

    worker.once('message', message => {
      if (message?.ok) finish(resolve, message.result);
      else finish(reject, new Error(message?.error || 'Der Importprozess lieferte kein gültiges Ergebnis.'));
    });
    worker.once('error', error => finish(reject, new Error(`Der geschützte Importprozess ist fehlgeschlagen: ${error.message}`)));
    worker.once('exit', code => {
      if (!settled && code !== 0) finish(reject, new Error(`Der geschützte Importprozess wurde unerwartet beendet (Code ${code}).`));
      else if (!settled) finish(reject, new Error('Der geschützte Importprozess wurde ohne Ergebnis beendet.'));
    });
  });
}

module.exports = { runImportTask };
