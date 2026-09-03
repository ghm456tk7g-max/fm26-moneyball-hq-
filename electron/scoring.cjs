const clamp=(n,min=0,max=100)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):50;
const finite=n=>Number.isFinite(n);
const per90=(value,minutes)=>finite(value)&&finite(minutes)&&minutes>0?(value*90)/minutes:null;

function percentile(values,value,higher=true){
  const clean=values.filter(finite).sort((a,b)=>a-b);
  if(!finite(value)||clean.length<2) return null;
  const below=clean.filter(v=>v<value).length;
  const equal=clean.filter(v=>v===value).length;
  const raw=(below+(equal-1)/2)/(clean.length-1);
  const regularity=clean.length/(clean.length+4);
  return clamp(50+(((higher?raw:1-raw)*100)-50)*regularity);
}
function weighted(parts){
  const usable=parts.filter(([v,w])=>finite(v)&&w>0);
  if(!usable.length) return null;
  return usable.reduce((sum,[v,w])=>sum+v*w,0)/usable.reduce((sum,[,w])=>sum+w,0);
}
function positionGroup(position){
  const tokens=String(position||'').toUpperCase().replace(/\s+/g,'').split(/[,;/]+/).filter(Boolean);
  for(const token of tokens){
    if(/^(GK|TW)$/.test(token)) return 'GK';
    if(/^(ST|SC|ST\([LCR]+\)|S\(C\))$/.test(token)) return 'ST';
    if(/^(AM[LR]?|OM[LR]?|AM\([LCR]+\)|OM\([LCR]+\))$/.test(token)) return 'AM';
    if(/^(ML|MR|M\([LR]\)|AML|AMR)$/.test(token)) return 'WINGER';
    if(/^(DM|DMC|DM\([LCR]+\))$/.test(token)) return 'DM';
    if(/^(CM|MC|M\(C\))$/.test(token)) return 'CM';
    if(/^(WB[LR]?|WBL|WBR|WB\([LR]+\)|FB[LR]?|DL|DR|D\([LR]+\))$/.test(token)) return 'FB';
    if(/^(DC|CB|D\(C\))$/.test(token)) return 'CB';
  }
  return 'OTHER';
}
function roleFit(player){
  const group=positionGroup(player.position);
  const g90=per90(player.goals,player.minutes);
  const a90=per90(player.assists,player.minutes);
  const rating=finite(player.rating)?clamp(50+(player.rating-6.75)*35):null;
  let evidence;
  if(group==='ST') evidence=weighted([[rating,.4],[finite(g90)?clamp(35+g90*70):null,.45],[finite(a90)?clamp(40+a90*45):null,.15]]);
  else if(group==='AM'||group==='WINGER') evidence=weighted([[rating,.45],[finite(g90)?clamp(40+g90*40):null,.2],[finite(a90)?clamp(38+a90*65):null,.35]]);
  else if(group==='CM'||group==='DM') evidence=weighted([[rating,.7],[finite(a90)?clamp(42+a90*50):null,.25],[finite(g90)?clamp(45+g90*25):null,.05]]);
  else if(group==='FB') evidence=weighted([[rating,.75],[finite(a90)?clamp(42+a90*55):null,.25]]);
  else evidence=rating;
  return Math.round(finite(evidence)?evidence:50);
}
function confidence(player){
  const core=['age','minutes','rating','value','wage'];
  const present=core.filter(k=>finite(player[k])).length+(String(player.position||'').trim()?1:0);
  const completeness=(present/6)*65;
  const mins=finite(player.minutes)?Math.max(0,player.minutes):0;
  const sample=mins>=900?35:mins>=450?23:mins>0?Math.min(15,mins/30):0;
  return clamp(completeness+sample);
}
function scoreDataset(players){
  const valid=Array.isArray(players)?players.filter(Boolean):[];
  const groups=new Map();
  for(const p of valid){const g=positionGroup(p.position);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(p);}
  return valid.map(player=>{
    const own=groups.get(positionGroup(player.position))||[];
    const peers=own.length>=2?own:valid;
    const gp=percentile(peers.map(p=>per90(p.goals,p.minutes)),per90(player.goals,player.minutes),true);
    const ap=percentile(peers.map(p=>per90(p.assists,p.minutes)),per90(player.assists,player.minutes),true);
    const rp=percentile(peers.map(p=>p.rating),player.rating,true);
    const performanceRaw=weighted([[rp,.55],[gp,.25],[ap,.20]]);
    const performance=finite(performanceRaw)?performanceRaw:50;
    const valuePct=percentile(peers.map(p=>p.value),player.value,false);
    const value=finite(valuePct)?weighted([[valuePct,.7],[performanceRaw,.3]]):50;
    const wagePct=percentile(peers.map(p=>p.wage),player.wage,false);
    const financial=finite(wagePct)?weighted([[wagePct,.75],[finite(valuePct)?value:null,.25]]):50;
    const agePct=percentile(peers.map(p=>p.age),player.age,false);
    const development=finite(agePct)?weighted([[agePct,.75],[performanceRaw,.25]]):50;
    const fit=roleFit(player);
    const conf=confidence(player);
    const components=[[performanceRaw,.30],[finite(valuePct)?value:null,.25],[finite(wagePct)?financial:null,.15],[finite(agePct)?development:null,.15],[fit,.10]];
    const rawMoneyball=weighted(components)??50;
    const moneyball=clamp(50+(rawMoneyball-50)*(.25+.75*(conf/100)));
    const minutes=finite(player.minutes)?player.minutes:0;
    const peerValues=peers.map(p=>p.value).filter(finite).sort((a,b)=>a-b);
    const medianValue=peerValues.length?peerValues[Math.floor((peerValues.length-1)/2)]:null;
    const tags=[];
    if(moneyball>=72&&conf>=65&&minutes>=450&&performance>=60&&fit>=55&&finite(player.value)&&finite(medianValue)&&player.value<=medianValue) tags.push('Hidden Gem');
    if(conf<55) tags.push('Low Confidence');
    if(finite(player.age)&&player.age<=21&&development>=65&&conf>=55) tags.push('Development');
    if(financial>=65&&finite(player.wage)&&conf>=55) tags.push('Budget Friendly');
    return {...player,scores:{performance:Math.round(performance),value:Math.round(value),financial:Math.round(financial),development:Math.round(development),roleFit:fit,confidence:Math.round(conf),moneyball:Math.round(moneyball)},tags};
  });
}
function transferDecision(player,budget=65000,maxWeeklyWage=1000){
  const s=player&&player.scores||{};
  budget=finite(budget)?Math.max(0,budget):0;maxWeeklyWage=finite(maxWeeklyWage)?Math.max(0,maxWeeklyWage):0;
  const hasValue=finite(player&&player.value)&&player.value>=0;
  const hasWage=finite(player&&player.wage)&&player.wage>=0;
  const value=hasValue?player.value:null,wage=hasWage?player.wage:null;
  const affordable=hasValue&&hasWage&&value<=budget&&wage<=maxWeeklyWage;
  const quality=finite(s.moneyball)?s.moneyball:50, conf=finite(s.confidence)?s.confidence:0;
  const maxBid=Math.round(Math.max(0,Math.min(budget*.45,hasValue?Math.max(value*1.15,budget*.05):budget*.15)));
  const maxWage=Math.round(Math.max(0,Math.min(maxWeeklyWage,maxWeeklyWage*(.3+clamp(quality)/200))));
  const firstYearCost=hasValue&&hasWage?Math.round(value+wage*52):null;
  let verdict='PASS';
  if(affordable&&conf>=70&&quality>=78) verdict='BUY';
  else if(affordable&&conf>=60&&quality>=68) verdict='CONSIDER';
  else if((affordable||!hasValue||!hasWage)&&quality>=60) verdict='WATCH';
  const reasons=[]; const risks=[];
  if(s.performance>=70) reasons.push('Starke relative Leistung');
  if(s.value>=65&&hasValue) reasons.push('Gutes Preis-Leistungs-Verhältnis');
  if(s.roleFit>=70) reasons.push('Gute taktische Eignung');
  if(s.development>=65&&conf>=55) reasons.push('Gutes Entwicklungspotenzial');
  if(conf<55) risks.push('Begrenzte oder unvollständige Daten');
  if(!hasValue) risks.push('Transferwert unbekannt');
  if(!hasWage) risks.push('Gehaltsforderung unbekannt');
  if((hasValue&&value>budget)||(hasWage&&wage>maxWeeklyWage)) risks.push('Außerhalb der konfigurierten Clubgrenzen');
  if(hasWage&&wage>maxWeeklyWage*.8) risks.push('Hohe Gehaltsbelastung');
  return {verdict,maxBid,maxWage,firstYearCost,affordable,reasons,risks};
}

module.exports={clamp,per90,percentile,positionGroup,roleFit,confidence,scoreDataset,transferDecision};
