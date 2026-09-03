const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const path=require('node:path');
const {openDatabase,createBackup}=require('./db.cjs');
const {importFile}=require('./importer.cjs');
const {scoreDataset,transferDecision}=require('./scoring.cjs');

let store;
function createWindow(){
  const win=new BrowserWindow({width:1500,height:950,minWidth:960,minHeight:680,backgroundColor:'#07111f',title:'FM26 MONEYBALL HQ',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL())event.preventDefault();});
  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev) win.loadURL(dev); else win.loadFile(path.join(__dirname,'..','dist','index.html'));
}
function defaults(){return {transferBudget:65000,maxWeeklyWage:1000,formation:'4-2-3-1'};}
function cleanSettings(value){
  const input=value&&typeof value==='object'?value:{};
  const bounded=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(1_000_000_000,Number(n))):0;
  return {transferBudget:bounded(input.transferBudget),maxWeeklyWage:bounded(input.maxWeeklyWage),formation:String(input.formation||'4-2-3-1').trim().slice(0,30)||'4-2-3-1'};
}
const gotLock=app.requestSingleInstanceLock();
if(!gotLock) app.quit();
app.on('second-instance',()=>{const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(()=>{
  try{store=openDatabase(app.getPath('userData'));}
  catch(error){dialog.showErrorBox('Datenbankfehler',`FM26 MONEYBALL HQ konnte die lokale Datenbank nicht öffnen.\n\n${error.message||error}`);app.quit();return;}
  if(!store.getSetting('club',null)) store.setSetting('club',defaults());
  ipcMain.handle('players:list',(_e,type)=>store.listPlayers(type||'targets'));
  ipcMain.handle('import:players',async(_e,type='targets')=>{
    const pick=await dialog.showOpenDialog({title:type==='squad'?'Eigenen Kader importieren':'Scouting-/Spielerexport importieren',properties:['openFile'],filters:[{name:'FM Export',extensions:['csv','txt','tsv']},{name:'Alle Dateien',extensions:['*']} ]});
    if(pick.canceled||!pick.filePaths[0]) return {canceled:true};
    const parsed=importFile(pick.filePaths[0],type);
    const scored=scoreDataset(parsed.players);
    store.replaceDataset(scored,type);
    return {canceled:false,rowCount:scored.length,warnings:parsed.warnings,map:parsed.map};
  });
  ipcMain.handle('shortlist:toggle',(_e,id)=>store.toggleShortlist(Number(id)));
  ipcMain.handle('settings:get',()=>cleanSettings(store.getSetting('club',defaults())));
  ipcMain.handle('settings:save',(_e,s)=>{const clean=cleanSettings(s);store.setSetting('club',clean);return clean;});
  ipcMain.handle('transfer:decision',(_e,player)=>{const s=cleanSettings(store.getSetting('club',defaults()));return transferDecision(player,s.transferBudget,s.maxWeeklyWage);});
  ipcMain.handle('backup:create',async()=>{
    const target=await dialog.showSaveDialog({title:'Backup speichern',defaultPath:`fm26-moneyball-hq-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'SQLite Backup',extensions:['sqlite']}]});
    if(target.canceled||!target.filePath) return {canceled:true};
    await createBackup(store.db,target.filePath);
    return {canceled:false,path:target.filePath};
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) createWindow();});
});
app.on('before-quit',()=>{if(store)store.close();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
