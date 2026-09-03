const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { DB_FILENAME, openDatabase, validateDatabaseFile } = require('./db.cjs');
const { importFile } = require('./importer.cjs');
const { scoreDataset, transferDecision } = require('./scoring.cjs');
const { DEFAULT_SETTINGS, normalizeSettings } = require('./settings.cjs');

const DATASET_TYPES = new Set(['targets', 'squad']);
let store;
let mainWindow;
let startupNotice = '';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unbekannter Fehler');
  return message.replace(/^Error invoking remote method '[^']+': Error:\s*/i, '').slice(0, 500);
}

function currentSettings() {
  try {
    return normalizeSettings(store.getSetting('club', DEFAULT_SETTINGS));
  } catch {
    store.setSetting('club', DEFAULT_SETTINGS);
    startupNotice = startupNotice || 'Ungültige Club-Einstellungen wurden auf sichere Standardwerte zurückgesetzt.';
    return { ...DEFAULT_SETTINGS };
  }
}

function initializeDatabase() {
  const userDataPath = app.getPath('userData');
  try {
    return openDatabase(userDataPath);
  } catch (error) {
    const message = errorMessage(error);
    const isCorrupt = /corrupt|malformed|not a database|integrity/i.test(message);
    const databasePath = path.join(userDataPath, DB_FILENAME);
    if (!isCorrupt || !fs.existsSync(databasePath)) throw error;

    const recoveryPath = path.join(userDataPath, `moneyball-hq-corrupt-${timestamp()}.sqlite`);
    fs.renameSync(databasePath, recoveryPath);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${databasePath}${suffix}`;
      if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${recoveryPath}${suffix}`);
    }
    startupNotice = `Die beschädigte Datenbank wurde gesichert: ${recoveryPath}. Eine neue Datenbank wurde angelegt.`;
    return openDatabase(userDataPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#07111f',
    title: 'FM26 MONEYBALL HQ',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  const devServer = process.env.VITE_DEV_SERVER_URL;
  const load = devServer
    ? mainWindow.loadURL(devServer)
    : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  load.catch(error => {
    dialog.showErrorBox('FM26 MONEYBALL HQ konnte nicht starten', errorMessage(error));
    app.quit();
  });
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Nicht erlaubte Anfrage.');
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`[${channel}]`, error);
      throw new Error(errorMessage(error));
    }
  });
}

function registerIpcHandlers() {
  handle('app:startup-status', () => {
    const notice = startupNotice;
    startupNotice = '';
    return { notice };
  });
  handle('players:list', type => {
    if (!DATASET_TYPES.has(type)) throw new Error('Ungültiger Datensatztyp.');
    return store.listPlayers(type);
  });
  handle('import:players', async (type = 'targets') => {
    if (!DATASET_TYPES.has(type)) throw new Error('Ungültiger Importtyp.');
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: type === 'squad' ? 'Eigenen Kader importieren' : 'Scouting-/Spielerexport importieren',
      properties: ['openFile'],
      filters: [
        { name: 'FM Export', extensions: ['csv', 'txt', 'tsv'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    const parsed = importFile(pick.filePaths[0], type);
    const scored = scoreDataset(parsed.players);
    store.replaceDataset(scored, type);
    return {
      canceled: false,
      rowCount: scored.length,
      sourceRowCount: parsed.sourceRowCount,
      duplicateCount: parsed.duplicateCount,
      warnings: parsed.warnings,
      map: parsed.map,
      encoding: parsed.encoding,
      delimiter: parsed.delimiter
    };
  });
  handle('shortlist:toggle', id => store.toggleShortlist(Number(id)));
  handle('settings:get', () => currentSettings());
  handle('settings:save', settings => {
    const validated = normalizeSettings(settings);
    store.setSetting('club', validated);
    return validated;
  });
  handle('transfer:decision', id => {
    const player = store.getPlayer(Number(id));
    if (!player) throw new Error('Der Spieler wurde nicht gefunden.');
    const settings = currentSettings();
    return transferDecision(player, settings.transferBudget, settings.maxWeeklyWage, store.listPlayers('squad'));
  });
  handle('backup:create', async () => {
    const target = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup speichern',
      defaultPath: `fm26-moneyball-hq-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite'] }]
    });
    if (target.canceled || !target.filePath) return { canceled: true };
    if (path.resolve(target.filePath) === path.resolve(store.databasePath)) throw new Error('Das Backup darf die aktive Datenbank nicht überschreiben.');
    await store.backupTo(target.filePath);
    return { canceled: false, path: target.filePath };
  });
  handle('backup:restore', async () => {
    const source = await dialog.showOpenDialog(mainWindow, {
      title: 'Datenbank-Backup wiederherstellen',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite', 'db'] }]
    });
    if (source.canceled || !source.filePaths[0]) return { canceled: true };
    if (path.resolve(source.filePaths[0]) === path.resolve(store.databasePath)) throw new Error('Die aktive Datenbank kann nicht als Backup wiederhergestellt werden.');
    validateDatabaseFile(source.filePaths[0]);
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Abbrechen', 'Backup wiederherstellen'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Backup wiederherstellen',
      message: 'Die aktuellen Daten werden durch das ausgewählte Backup ersetzt.',
      detail: 'Vorher wird automatisch eine Sicherheitskopie der aktuellen Datenbank angelegt.'
    });
    if (confirmation.response !== 1) return { canceled: true };

    const databasePath = store.databasePath;
    const safetyPath = path.join(path.dirname(databasePath), `moneyball-hq-before-restore-${timestamp()}.sqlite`);
    const temporaryPath = path.join(path.dirname(databasePath), `moneyball-hq-restore-${timestamp()}.tmp`);
    await store.backupTo(safetyPath);
    fs.copyFileSync(source.filePaths[0], temporaryPath);
    validateDatabaseFile(temporaryPath);
    store.close();
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const target = `${databasePath}${suffix}`;
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      fs.renameSync(temporaryPath, databasePath);
      store = openDatabase(app.getPath('userData'));
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      fs.copyFileSync(safetyPath, databasePath);
      store = openDatabase(app.getPath('userData'));
      throw error;
    }
    return { canceled: false, safetyPath };
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('de.fm26.moneyballhq');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    try {
      store = initializeDatabase();
      if (!store.getSetting('club', null)) store.setSetting('club', DEFAULT_SETTINGS);
      currentSettings();
      registerIpcHandlers();
      createWindow();
    } catch (error) {
      dialog.showErrorBox('Lokale Datenbank konnte nicht geöffnet werden', `${errorMessage(error)}\n\nDie Daten wurden nicht gelöscht.`);
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && store) createWindow();
  });
}

app.on('before-quit', () => {
  if (store) {
    store.close();
    store = null;
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
