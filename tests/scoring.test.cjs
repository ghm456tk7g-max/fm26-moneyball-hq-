const test=require('node:test');
const assert=require('node:assert/strict');
const {scoreDataset,transferDecision,confidence}=require('../electron/scoring.cjs');

test('missing data lowers confidence instead of becoming zero performance',()=>{
  const full={name:'A',position:'ST',age:21,minutes:1400,goals:12,assists:5,rating:7.2,value:15000,wage:300};
  const sparse={name:'B',position:'ST',age:21,minutes:null,goals:null,assists:null,rating:null,value:null,wage:null};
  assert.ok(confidence(full)>confidence(sparse));
  const scored=scoreDataset([full,sparse]);
  assert.ok(scored[1].scores.confidence<scored[0].scores.confidence);
});

test('strong affordable player receives positive transfer verdict',()=>{
  const players=scoreDataset([
    {name:'Target',position:'ST',age:20,minutes:1800,goals:20,assists:8,rating:7.5,value:12000,wage:250},
    {name:'Peer 1',position:'ST',age:28,minutes:1800,goals:5,assists:2,rating:6.7,value:30000,wage:700},
    {name:'Peer 2',position:'ST',age:31,minutes:1800,goals:2,assists:1,rating:6.5,value:45000,wage:900}
  ]);
  const d=transferDecision(players[0],65000,1000);
  assert.equal(d.affordable,true);
  assert.ok(['BUY','CONSIDER'].includes(d.verdict));
  assert.ok(d.maxBid<=65000);
});

test('club constraints can force a pass',()=>{
  const p={scores:{moneyball:90,confidence:90},value:100000,wage:1500};
  const d=transferDecision(p,65000,1000);
  assert.equal(d.affordable,false);
  assert.equal(d.verdict,'PASS');
});
