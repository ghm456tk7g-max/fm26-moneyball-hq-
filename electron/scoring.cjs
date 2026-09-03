const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const per90=(value,minutes)=>Number.isFinite(value)&&minutes>0?(value*90)/minutes:null;

function percentile(values,value,higher=true){
  const clean=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!Number.isFinite(value)||clean.length<2) return 50;
  const below=clean.filter(v=>v<value).length;
  const equal=clean.filter(v=>v===value).length;
  const rank=(below+Math.max(0,equal-1)/2)/(clean.length-1);
  return clamp((higher?rank:1-rank)*100);
}

function roleFit(player){
  const p=(player.position||'').toUpperCase();
  const g90=per90(player.goals,player.minutes)||0;
  const a90=per90(player.assists,player.minutes)||0;
  const rating=player.rating||6.5;
  if(/ST|SC|AM\s*\(C\)/.test(p)) return clamp(45+g90*65+a90*30+(rating-6.5)*18);
  if(/AM|AML|AMR|MR|ML/.test(p)) return clamp(45+g90*35+a90*55+(rating-6.5)*18);
  if(/DM|MC|CM/.test(p)) return clamp(48+g90*20+a90*40+(rating-6.5)*22);
  if(/DL|DR|WB|FB/.test(p)) return clamp(50+a90*38+(rating-6.5)*25);
  if(/DC|CB/.test(p)) return clamp(55+(rating-6.5)*30-Math.max(0,(player.age||25)-31)*2);
  if(/GK/.test(p)) return clamp(55+(rating-6.5)*32);
  return clamp(50+(rating-6.5)*20);
}

function confidence(player){
  const fields=['age','position','minutes','rating','value','wage'];
  const present=fields.filter(k=>(k==='position'&&!!player[k])||(k!=='position'&&Number.isFinite(player[k]))).length;
  let score=(present/fields.length)*70;
  const mins=player.minutes||0;
  score+=mins>=900?30:mins>=450?20:mins>0?10:0;
  return clamp(score);
}

function scoreDataset(players){
  const ratings=players.map(p=>p.rating);
  const goalRates=players.map(p=>per90(p.goals,p.minutes));
  const assistRates=players.map(p=>per90(p.assists,p.minutes));
  const values=players.map(p=>p.value);
  const wages=players.map(p=>p.wage);
  const ages=players.map(p=>p.age);
  const cleanValues=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const medianValue=cleanValues[Math.floor(cleanValues.length/2)]||0;
  return players.map(player=>{
    const gp=percentile(goalRates,per90(player.goals,player.minutes),true);
    const ap=percentile(assistRates,per90(player.assists,player.minutes),true);
    const rp=percentile(ratings,player.rating,true);
    const performance=clamp(rp*.55+gp*.25+ap*.20);
    const value=clamp(percentile(values,player.value,false)*.7+performance*.3);
    const financial=clamp(percentile(wages,player.wage,false)*.75+value*.25);
    const development=clamp(percentile(ages,player.age,false)*.75+performance*.25);
    const fit=roleFit(player);
    const conf=confidence(player);
    const moneyball=clamp(performance*.30+value*.25+financial*.15+development*.15+fit*.10+conf*.05);
    const hiddenGem=moneyball>=78&&((Number.isFinite(player.value)&&player.value<=medianValue)||(player.age||99)<=23);
    const tags=[];
    if(hiddenGem) tags.push('Hidden Gem');
    if(conf<55) tags.push('Low Confidence');
    if((player.age||99)<=21&&development>=70) tags.push('Development');
    if(financial>=80) tags.push('Budget Friendly');
    return {...player,scores:{performance:Math.round(performance),value:Math.round(value),financial:Math.round(financial),development:Math.round(development),roleFit:Math.round(fit),confidence:Math.round(conf),moneyball:Math.round(moneyball)},tags};
  });
}

function transferDecision(player,budget=65000,maxWeeklyWage=1000){
  const s=player.scores||{};
  const wage=player.wage||0;
  const value=player.value||0;
  const maxBid=Math.round(Math.min(budget*.45,Math.max(value*1.25,budget*.08)));
  const maxWage=Math.round(Math.min(maxWeeklyWage,Math.max(wage*1.15,maxWeeklyWage*.35)));
  const firstYearCost=Math.round(value+wage*52);
  const affordable=value<=budget&&wage<=maxWeeklyWage;
  let verdict='PASS';
  if(affordable&&s.moneyball>=82&&s.confidence>=60) verdict='BUY';
  else if(affordable&&s.moneyball>=72) verdict='CONSIDER';
  else if(affordable&&(s.moneyball>=65||s.confidence<55)) verdict='WATCH';
  const reasons=[]; const risks=[];
  if(s.performance>=75) reasons.push('Strong relative performance');
  if(s.value>=75) reasons.push('Good value for money');
  if(s.roleFit>=80) reasons.push('Excellent tactical fit');
  if(s.development>=78) reasons.push('Strong development/upside profile');
  if(s.confidence<55) risks.push('Limited or incomplete data');
  if(!affordable) risks.push('Outside configured club constraints');
  if(wage>maxWeeklyWage*.8) risks.push('High wage impact');
  return {verdict,maxBid,maxWage,firstYearCost,affordable,reasons,risks};
}

module.exports={clamp,per90,percentile,roleFit,confidence,scoreDataset,transferDecision};
