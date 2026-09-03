export {};
declare global {
  interface Window {
    moneyball: {
      importPlayers:(datasetType:'targets'|'squad')=>Promise<any>;
      listPlayers:(datasetType:'targets'|'squad')=>Promise<any[]>;
      toggleShortlist:(id:number)=>Promise<boolean>;
      getSettings:()=>Promise<any>;
      saveSettings:(settings:any)=>Promise<any>;
      backup:()=>Promise<any>;
      transferDecision:(player:any)=>Promise<any>;
    }
  }
}
