const test = require('node:test');
const assert = require('node:assert/strict');
const {
  confidence,
  compareToSquad,
  percentile,
  positionGroups,
  roleFit,
  scoreDataset,
  transferDecision
} = require('../electron/scoring.cjs');

function player(overrides = {}) {
  return {
    name: 'Player', position: 'ST', age: 24, minutes: 1200, goals: 8, assists: 4,
    rating: 7, value: 20000, wage: 400, ...overrides
  };
}

test('missing data lowers confidence without becoming zero performance', () => {
  const full = player({ name: 'A', age: 21, minutes: 1400, goals: 12, assists: 5, rating: 7.2, value: 15000, wage: 300 });
  const sparse = player({ name: 'B', age: 21, minutes: null, goals: null, assists: null, rating: null, value: null, wage: null });
  assert.ok(confidence(full) > confidence(sparse));
  const scored = scoreDataset([full, sparse]);
  assert.equal(scored[1].scores.performance, 50);
  assert.equal(scored[1].scores.value, 50);
  assert.equal(scored[1].scores.financial, 50);
  assert.ok(scored[1].scores.confidence < 40);
  assert.ok(Number.isFinite(scored[1].scores.moneyball));
});

test('small comparison groups are shrunk toward neutral instead of returning fake extremes', () => {
  assert.equal(percentile([1], 1), 50);
  assert.ok(percentile([1, 2], 2) < 60);
  assert.ok(percentile([1, 2, 3], 3) < 70);
  assert.equal(percentile([1, 2, 3], null), null);
});

test('recognizes English, German and compound FM position strings', () => {
  assert.deepEqual(positionGroups('GK'), ['GK']);
  assert.deepEqual(positionGroups('D (RLC), WB (R)'), ['CB', 'FB/WB']);
  assert.deepEqual(positionGroups('DM, M (C)'), ['DM', 'CM']);
  assert.deepEqual(positionGroups('AM (RLC), ST (C)'), ['AM', 'Winger', 'ST']);
  assert.deepEqual(positionGroups('IV, ZDM, ZM, ZOM, LA, MS'), ['CB', 'DM', 'CM', 'AM', 'Winger', 'ST']);
  assert.deepEqual(positionGroups(''), []);
});

test('position label alone does not create an artificially strong role fit', () => {
  assert.equal(roleFit({ position: 'ST', minutes: null, goals: null, assists: null, rating: null }), 50);
  assert.equal(roleFit({ position: 'GK', minutes: 0, goals: 0, assists: 0, rating: null }), 50);
});

test('confidence applies explicit 0, 450 and 900 minute gates', () => {
  const complete = minutes => player({ minutes });
  assert.ok(confidence(complete(0)) <= 35);
  assert.ok(confidence(complete(449)) <= 54);
  assert.ok(confidence(complete(450)) > confidence(complete(449)));
  assert.ok(confidence(complete(899)) <= 74);
  assert.ok(confidence(complete(900)) > confidence(complete(899)));
});

test('zero minutes and non-finite values never produce NaN or Infinity scores', () => {
  const scored = scoreDataset([
    player({ name: 'Zero', minutes: 0, goals: 500, assists: Number.POSITIVE_INFINITY, rating: Number.NaN, value: null, wage: null }),
    player({ name: 'Normal' })
  ]);
  for (const candidate of scored) {
    for (const value of Object.values(candidate.scores)) assert.ok(Number.isFinite(value));
  }
  assert.ok(scored[0].scores.confidence <= 35);
});

test('a strong player in a tiny group stays WATCH until the comparison is reliable', () => {
  const players = scoreDataset([
    player({ name: 'Target', age: 20, minutes: 1800, goals: 20, assists: 8, rating: 7.5, value: 12000, wage: 250 }),
    player({ name: 'Peer 1', age: 28, minutes: 1800, goals: 5, assists: 2, rating: 6.7, value: 30000, wage: 700 }),
    player({ name: 'Peer 2', age: 31, minutes: 1800, goals: 2, assists: 1, rating: 6.5, value: 45000, wage: 900 })
  ]);
  const decision = transferDecision(players[0], 65000, 1000);
  assert.equal(decision.affordable, true);
  assert.equal(decision.verdict, 'WATCH');
  assert.ok(decision.risks.includes('Sehr kleine Vergleichsgruppe'));
});

test('reliable high-performing affordable player can receive a positive verdict and Hidden Gem tag', () => {
  const peers = Array.from({ length: 8 }, (_, index) => player({
    name: `Peer ${index}`,
    age: 25 + index,
    minutes: 1500,
    goals: 2 + index,
    assists: 1 + Math.floor(index / 2),
    rating: 6.4 + index * 0.08,
    value: 30000 + index * 5000,
    wage: 600 + index * 70
  }));
  const target = player({ name: 'Target', age: 20, minutes: 1900, goals: 22, assists: 10, rating: 7.55, value: 12000, wage: 250 });
  const scored = scoreDataset([target, ...peers]);
  assert.ok(scored[0].tags.includes('Hidden Gem'));
  const decision = transferDecision(scored[0], 65000, 1000);
  assert.equal(decision.affordable, true);
  assert.ok(['BUY', 'CONSIDER'].includes(decision.verdict));
  assert.ok(decision.maxBid <= 65000);
  assert.ok(decision.maxWage <= 1000);
  assert.ok(decision.risks.some(risk => risk.includes('angenähert')));
});

test('missing finances can never produce BUY or CONSIDER', () => {
  const high = { scores: { moneyball: 95, confidence: 95, performance: 95, value: 95, roleFit: 95, development: 95 }, value: null, wage: null };
  const decision = transferDecision(high, 65000, 1000);
  assert.equal(decision.affordable, false);
  assert.equal(decision.financesKnown, false);
  assert.equal(decision.verdict, 'WATCH');
  assert.equal(decision.firstYearCost, null);
  assert.equal(decision.maxBid, null);
  assert.equal(decision.maxWage, null);
});

test('either known club constraint breach forces PASS, including partial financial data', () => {
  const scores = { moneyball: 95, confidence: 95 };
  assert.equal(transferDecision({ scores, value: 100000, wage: 500 }, 65000, 1000).verdict, 'PASS');
  assert.equal(transferDecision({ scores, value: 10000, wage: 1500 }, 65000, 1000).verdict, 'PASS');
  assert.equal(transferDecision({ scores, value: 100000, wage: null }, 65000, 1000).verdict, 'PASS');
});

test('low confidence blocks a positive recommendation even when affordable', () => {
  const decision = transferDecision({ scores: { moneyball: 90, confidence: 40 }, value: 10000, wage: 300 }, 65000, 1000);
  assert.equal(decision.verdict, 'WATCH');
  assert.ok(decision.risks.some(risk => risk.includes('unsicher')));
});

test('Hidden Gem and Budget Friendly tags require known finances and sufficient confidence', () => {
  const sparseTarget = player({ name: 'Sparse', age: 19, minutes: null, goals: null, assists: null, rating: null, value: null, wage: null });
  const scored = scoreDataset([sparseTarget, ...Array.from({ length: 8 }, (_, index) => player({ name: `Peer ${index}` }))]);
  assert.ok(!scored[0].tags.includes('Hidden Gem'));
  assert.ok(!scored[0].tags.includes('Budget Friendly'));
  assert.ok(scored[0].tags.includes('Low Confidence'));
});

test('invalid configured budgets fail closed', () => {
  const decision = transferDecision({ scores: { moneyball: 95, confidence: 95 }, value: 1, wage: 1 }, Number.NaN, -5);
  assert.equal(decision.affordable, false);
  assert.equal(decision.verdict, 'PASS');
});

test('compares a target only with evidenced squad players in the same position group', () => {
  const target = player({ position: 'AM (R)', rating: 7.4, goals: 10, assists: 12 });
  const squad = [
    player({ name: 'Winger 1', position: 'AM (L)', rating: 6.8, goals: 3, assists: 4 }),
    player({ name: 'Winger 2', position: 'MR', rating: 6.9, goals: 4, assists: 5 }),
    player({ name: 'Centre Back', position: 'DC', rating: 7.8 }),
    player({ name: 'Unknown data', position: 'AM (R)', rating: null, minutes: null, goals: null, assists: null })
  ];
  const comparison = compareToSquad(target, squad);
  assert.equal(comparison.group, 'Winger');
  assert.equal(comparison.squadCount, 2);
  assert.ok(comparison.deltaToAverage > 0);
  assert.equal(compareToSquad(player({ rating: null, minutes: null, goals: null, assists: null }), squad), null);
});
