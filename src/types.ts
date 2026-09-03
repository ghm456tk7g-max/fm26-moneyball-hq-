export type Player={id:number;name:string;club:string;position:string;age:number|null;minutes:number|null;goals:number|null;assists:number|null;rating:number|null;value:number|null;wage:number|null;scores:Record<string,number>;tags:string[];shortlisted:boolean};
export type Settings={transferBudget:number;maxWeeklyWage:number;formation:string};
export const money=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
export const scoreClass=(n:number)=>n>=80?'good':n>=65?'mid':'bad';
export const positionGroup=(position:string)=>{
 const tokens=String(position||'').toUpperCase().replace(/\s+/g,'').split(/[,;/]+/).filter(Boolean);
 for(const token of tokens){
  if(/^(GK|TW)$/.test(token))return 'GK'; if(/^(ST|SC|ST\([LCR]+\)|S\(C\))$/.test(token))return 'ST';
  if(/^(AM[LR]?|OM[LR]?|AM\([LCR]+\)|OM\([LCR]+\))$/.test(token))return 'AM'; if(/^(ML|MR|M\([LR]\)|AML|AMR)$/.test(token))return 'Winger';
  if(/^(DM|DMC|DM\([LCR]+\))$/.test(token))return 'DM'; if(/^(CM|MC|M\(C\))$/.test(token))return 'CM';
  if(/^(WB[LR]?|WBL|WBR|WB\([LR]+\)|FB[LR]?|DL|DR|D\([LR]+\))$/.test(token))return 'FB'; if(/^(DC|CB|D\(C\))$/.test(token))return 'CB';
 }
 return 'Unbekannt';
};
