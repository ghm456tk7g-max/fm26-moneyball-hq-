const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {openDatabase}=require('./db.cjs');
const {importFile}=require('./importer.cjs');
const {scoreDataset,transferDecision}=require('./scoring.cjs');

let store;
function createWindow(){
  const win=new BrowserWindow({width:1500,height:950,minWidth:1100,minHeight:720,backgroundColor:'#07111f',title:'FM26 MONEYBALL HQ',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev) win.loadURL(dev); else win.loadFile(path.join(__dirname,'..','dist','index.html'));
}
app.whenReady().then(()=>{
  store=openDatabase(app.getPath('userData'));
  const defaultSettings={transferBudget:65000,maxWeeklyWage:1000,formation:'4-2-3-1'};
  if(!store.getSetting('club',null)) store.setSetting('club',defaultSettings);
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
  ipcMain.handle('settings:get',()=>store.getSetting('club',{transferBudget:65000,maxWeeklyWage:1000,formation:'4-2-3-1'}));
  ipcMain.handle('settings:save',(_e,s)=>{store.setSetting('club',s);return s;});
  ipcMain.handle('transfer:decision',(_e,player)=>{const s=store.getSetting('club',{transferBudget:65000,maxWeeklyWage:1000});return transferDecision(player,Number(s.transferBudget)||0,Number(s.maxWeeklyWage)||0);});
  ipcMain.handle('backup:create',async()=>{
    const target=await dialog.showSaveDialog({title:'Backup speichern',defaultPath:`fm26-moneyball-hq-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'SQLite Backup',extensions:['sqlite']}]});
    if(target.canceled||!target.filePath) return {canceled:true};
    store.db.pragma('wal_checkpoint(FULL)');
    fs.copyFileSync(path.join(app.getPath('userData'),'moneyball-hq.sqlite'),target.filePath);
    return {canceled:false,path:target.filePath};
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
