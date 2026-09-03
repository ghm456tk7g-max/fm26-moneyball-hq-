export type Player={id:number;name:string;club:string;position:string;age:number|null;minutes:number|null;goals:number|null;assists:number|null;rating:number|null;value:number|null;wage:number|null;scores:Record<string,number>;tags:string[];shortlisted:boolean};
export type Settings={transferBudget:number;maxWeeklyWage:number;formation:string};
export const money=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
export const scoreClass=(n:number)=>n>=80?'good':n>=65?'mid':'bad';
