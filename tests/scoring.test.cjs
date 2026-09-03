const test=require('node:test');
const assert=require('node:assert/strict');
const {percentile,positionGroup,roleFit,scoreDataset,transferDecision,confidence}=require('../electron/scoring.cjs');

test('all score boundaries remain finite and within 0..100',()=>{
  const players=scoreDataset([
    {name:'Extreme',position:'ST',age:-10,minutes:1,goals:1e99,assists:0,rating:99,value:0,wage:0},
    {name:'Broken',position:'',age:null,minutes:0,goals:null,assists:Infinity,rating:NaN,value:null,wage:null}
  ]);
  for(const p of players) for(const n of Object.values(p.scores)){assert.equal(Number.isFinite(n),true);assert.ok(n>=0&&n<=100);}
});
test('missing data lowers confidence and shrinks score toward neutral',()=>{
  const full={name:'A',position:'ST',age:21,minutes:1400,goals:12,assists:5,rating:7.2,value:15000,wage:300};
  const sparse={name:'B',position:'ST',age:21,minutes:null,goals:null,assists:null,rating:null,value:null,wage:null};
  const scored=scoreDataset([full,sparse]);assert.ok(confidence(full)>confidence(sparse));assert.ok(scored[1].scores.confidence<55);
  assert.ok(Math.abs(scored[1].scores.moneyball-50)<=10);assert.ok(!scored[1].tags.includes('Hidden Gem'));
});
test('confidence honors 450 and 900 minute thresholds',()=>{
  const p={position:'CM',age:24,rating:7,value:10000,wage:300};
  assert.ok(confidence({...p,minutes:449})<confidence({...p,minutes:450}));
  assert.ok(confidence({...p,minutes:899})<confidence({...p,minutes:900}));
});
test('small comparison groups are regularized and missing percentiles stay missing',()=>{
  assert.equal(percentile([1],1),null);assert.equal(percentile([1,2],null),null);assert.ok(percentile([1,2],2)<70);
});
test('FM position strings map to stable role groups',()=>{
  assert.equal(positionGroup('D (C), DM, M (C)'),'CB');assert.equal(positionGroup('D (L), WB (L)'),'FB');
  assert.equal(positionGroup('AM (R), ST (C)'),'AM');assert.equal(positionGroup('TW'),'GK');
  assert.ok(roleFit({position:'AM (C)',minutes:1000,goals:2,assists:8,rating:7.1})>50);
});
test('position-specific peers prevent cross-position distortion',()=>{
  const players=scoreDataset([
    {name:'ST1',position:'ST',age:22,minutes:1000,goals:10,assists:2,rating:7.2,value:10000,wage:300},
    {name:'ST2',position:'ST',age:24,minutes:1000,goals:2,assists:1,rating:6.7,value:20000,wage:500},
    {name:'GK1',position:'GK',age:25,minutes:1000,goals:0,assists:0,rating:7.3,value:10000,wage:300},
    {name:'GK2',position:'GK',age:26,minutes:1000,goals:0,assists:0,rating:6.8,value:20000,wage:500}
  ]);
  assert.ok(players[0].scores.performance>players[1].scores.performance);assert.ok(players[2].scores.performance>players[3].scores.performance);
});
test('known club constraints force PASS regardless of score',()=>{
  const p={scores:{moneyball:99,confidence:99,performance:99,value:99,roleFit:99},value:100000,wage:1500};
  const d=transferDecision(p,65000,1000);assert.equal(d.affordable,false);assert.equal(d.verdict,'PASS');assert.ok(d.risks.some(r=>r.includes('Clubgrenzen')));
});
test('unknown financials can never produce BUY or CONSIDER',()=>{
  for(const p of [{value:null,wage:100},{value:1000,wage:null},{value:null,wage:null}]){
    const d=transferDecision({...p,scores:{moneyball:95,confidence:95,performance:90,roleFit:90}},65000,1000);
    assert.ok(['WATCH','PASS'].includes(d.verdict));assert.equal(d.affordable,false);assert.equal(d.firstYearCost,null);
  }
});
test('strong affordable and sufficiently evidenced player may be recommended',()=>{
  const d=transferDecision({scores:{moneyball:82,confidence:75,performance:80,value:75,roleFit:80},value:12000,wage:250},65000,1000);
  assert.equal(d.verdict,'BUY');assert.equal(d.firstYearCost,25000);assert.ok(d.maxBid<=65000*.45);assert.ok(d.maxWage<=1000);
});
