const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('moneyball',{
  importPlayers:(datasetType)=>ipcRenderer.invoke('import:players',datasetType),
  listPlayers:(datasetType)=>ipcRenderer.invoke('players:list',datasetType),
  toggleShortlist:(id)=>ipcRenderer.invoke('shortlist:toggle',id),
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  saveSettings:(settings)=>ipcRenderer.invoke('settings:save',settings),
  backup:()=>ipcRenderer.invoke('backup:create'),
  transferDecision:(player)=>ipcRenderer.invoke('transfer:decision',player)
});
