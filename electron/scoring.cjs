const clamp = (number, min = 0, max = 100) => Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
const per90 = (value, minutes) => Number.isFinite(value) && Number.isFinite(minutes) && minutes > 0 ? (value * 90) / minutes : null;
const finite = value => Number.isFinite(value);

const POSITION_ORDER = ['GK', 'CB', 'FB/WB', 'DM', 'CM', 'AM', 'Winger', 'ST'];
const POSITION_PATTERNS = [
  ['GK', /\b(?:GK|TW|GOALKEEPER|TORWART)\b/i],
  ['CB', /(?:\bD\s*\(\s*[LR]*C[LR]*\s*\)|\bDC\b|\bCB\b|\bIV\b|CENT(?:ER|RE)\s*BACK|INNENVERTEIDIGER)/i],
  ['FB/WB', /(?:\b(?:D|WB)\s*\(\s*[CLR]*[LR][CLR]*\s*\)|\b(?:DL|DR|WBL|WBR|FB|WB|LV|RV|AV)\b|FULL\s*BACK|WING\s*BACK|AUSSENVERTEIDIGER)/i],
  ['DM', /\b(?:DM|DMC|ZDM|DEFENSIVE\s*MIDFIELDER)\b/i],
  ['CM', /(?:\bM\s*\(\s*[LR]*C[LR]*\s*\)|\b(?:MC|CM|ZM)\b|CENTRAL\s*MIDFIELDER|ZENTRALES\s*MITTELFELD)/i],
  ['AM', /(?:\bAM\s*\(\s*[LR]*C[LR]*\s*\)|\b(?:AMC|ZOM)\b|ATTACKING\s*MIDFIELDER\s*\(?C|OFFENSIVES\s*MITTELFELD)/i],
  ['Winger', /(?:\b(?:AM|M)\s*\(\s*[CLR]*[LR][CLR]*\s*\)|\b(?:AML|AMR|ML|MR|LW|RW|LA|RA)\b|WINGER|FLÜGEL)/i],
  ['ST', /\b(?:ST|SC|FC|MS|STRIKER|STÜRMER|FORWARD)\b/i]
];

const ROLE_WEIGHTS = {
  GK: { rating: 1 },
  CB: { rating: 0.8, goals: 0.1, assists: 0.1 },
  'FB/WB': { rating: 0.55, goals: 0.05, assists: 0.4 },
  DM: { rating: 0.7, goals: 0.1, assists: 0.2 },
  CM: { rating: 0.6, goals: 0.1, assists: 0.3 },
  AM: { rating: 0.45, goals: 0.2, assists: 0.35 },
  Winger: { rating: 0.4, goals: 0.25, assists: 0.35 },
  ST: { rating: 0.35, goals: 0.5, assists: 0.15 },
  Unknown: { rating: 0.6, goals: 0.2, assists: 0.2 }
};

function positionGroups(position) {
  const text = String(position || '').normalize('NFKC').toUpperCase();
  if (!text.trim()) return [];
  return POSITION_PATTERNS
    .map(([group, pattern]) => ({ group, index: text.search(pattern) }))
    .filter(match => match.index >= 0)
    .sort((a, b) => a.index - b.index || POSITION_ORDER.indexOf(a.group) - POSITION_ORDER.indexOf(b.group))
    .map(match => match.group);
}

function primaryPosition(position) {
  return positionGroups(position)[0] || 'Unknown';
}

function percentile(values, value, higher = true) {
  const clean = values.filter(finite).sort((a, b) => a - b);
  if (!finite(value)) return null;
  if (clean.length < 2) return 50;
  const below = clean.filter(candidate => candidate < value).length;
  const equal = clean.filter(candidate => candidate === value).length;
  const rank = (below + Math.max(0, equal - 1) / 2) / (clean.length - 1);
  const raw = (higher ? rank : 1 - rank) * 100;
  // Tiny groups otherwise generate deceptive 0/100 extremes. Eight comparable
  // players are required before the percentile is used at full strength.
  const reliability = Math.min(1, (clean.length - 1) / 7);
  return clamp(50 + (raw - 50) * reliability);
}

function weightedScore(parts, fallback = 50) {
  const available = parts.filter(part => finite(part.value) && part.weight > 0);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (!totalWeight) return fallback;
  return clamp(available.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight);
}

function benchmarkScore(metric, value) {
  if (!finite(value)) return null;
  if (metric === 'rating') return clamp(50 + (value - 6.8) * 60);
  if (metric === 'goals') return clamp((value / 0.65) * 100);
  if (metric === 'assists') return clamp((value / 0.45) * 100);
  return null;
}

function roleFit(player, peers = []) {
  const group = primaryPosition(player.position);
  const weights = ROLE_WEIGHTS[group] || ROLE_WEIGHTS.Unknown;
  const goalRate = per90(player.goals, player.minutes);
  const assistRate = per90(player.assists, player.minutes);
  const peerValues = {
    rating: peers.map(peer => peer.rating),
    goals: peers.map(peer => per90(peer.goals, peer.minutes)),
    assists: peers.map(peer => per90(peer.assists, peer.minutes))
  };
  const current = { rating: player.rating, goals: goalRate, assists: assistRate };
  const parts = Object.entries(weights).map(([metric, weight]) => ({
    weight,
    value: peers.length ? percentile(peerValues[metric], current[metric], true) : benchmarkScore(metric, current[metric])
  }));
  return weightedScore(parts);
}

function confidence(player, comparisonSize = 8) {
  const coverageWeights = {
    position: 0.1,
    age: 0.1,
    minutes: 0.15,
    rating: 0.15,
    value: 0.15,
    wage: 0.15,
    goals: 0.1,
    assists: 0.1
  };
  const coverage = Object.entries(coverageWeights).reduce((sum, [key, weight]) => {
    const present = key === 'position' ? Boolean(String(player.position || '').trim()) : finite(player[key]);
    return sum + (present ? weight : 0);
  }, 0) * 65;

  const minutes = finite(player.minutes) ? player.minutes : null;
  const sampleScore = minutes === null || minutes <= 0 ? 0 : minutes < 450 ? 5 : minutes < 900 ? 20 : 35;
  const groupPenalty = comparisonSize >= 8 ? 0 : comparisonSize >= 5 ? 3 : comparisonSize >= 3 ? 8 : 15;
  let score = clamp(coverage + sampleScore - groupPenalty);
  if (minutes === null || minutes <= 0) score = Math.min(score, 35);
  else if (minutes < 450) score = Math.min(score, 54);
  else if (minutes < 900) score = Math.min(score, 74);
  return clamp(score);
}

function metricPercentile(peers, player, metric, higher = true) {
  const selector = metric === 'goals' || metric === 'assists'
    ? candidate => per90(candidate[metric], candidate.minutes)
    : candidate => candidate[metric];
  return percentile(peers.map(selector), selector(player), higher);
}

function median(values) {
  const clean = values.filter(finite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function scoreDataset(inputPlayers) {
  const players = Array.isArray(inputPlayers) ? inputPlayers.filter(Boolean) : [];
  const groups = new Map();
  for (const player of players) {
    const group = primaryPosition(player.position);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(player);
  }

  return players.map(player => {
    const group = primaryPosition(player.position);
    const peers = groups.get(group) || [player];
    const ratingPercentile = metricPercentile(peers, player, 'rating');
    const goalPercentile = metricPercentile(peers, player, 'goals');
    const assistPercentile = metricPercentile(peers, player, 'assists');
    const performance = weightedScore([
      { value: ratingPercentile, weight: 0.55 },
      { value: goalPercentile, weight: 0.25 },
      { value: assistPercentile, weight: 0.2 }
    ]);

    const pricePercentile = metricPercentile(peers, player, 'value', false);
    const wagePercentile = metricPercentile(peers, player, 'wage', false);
    const agePercentile = metricPercentile(peers, player, 'age', false);
    const value = finite(player.value) ? weightedScore([
      { value: pricePercentile, weight: 0.7 },
      { value: performance, weight: 0.3 }
    ]) : 50;
    const financial = finite(player.value) || finite(player.wage) ? weightedScore([
      { value: pricePercentile, weight: 0.4 },
      { value: wagePercentile, weight: 0.6 }
    ]) : 50;
    const development = finite(player.age) ? weightedScore([
      { value: agePercentile, weight: 0.75 },
      { value: performance, weight: 0.25 }
    ]) : 50;
    const fit = roleFit(player, peers);
    const conf = confidence(player, peers.length);
    const rawMoneyball = weightedScore([
      { value: performance, weight: 0.3 },
      { value, weight: 0.25 },
      { value: financial, weight: 0.15 },
      { value: development, weight: 0.15 },
      { value: fit, weight: 0.1 },
      { value: conf, weight: 0.05 }
    ]);
    const moneyball = 50 + (rawMoneyball - 50) * (0.55 + 0.45 * conf / 100);
    const groupMedianValue = median(peers.map(candidate => candidate.value));
    const hasReliableFinancials = finite(player.value) && finite(player.wage);
    const hiddenGem = peers.length >= 4 && conf >= 65 && hasReliableFinancials &&
      performance >= 65 && value >= 65 && moneyball >= 70 && player.value <= groupMedianValue;
    const tags = [];
    if (hiddenGem) tags.push('Hidden Gem');
    if (conf < 60) tags.push('Low Confidence');
    if (finite(player.age) && player.age <= 21 && development >= 65 && conf >= 50) tags.push('Development');
    if (hasReliableFinancials && financial >= 70 && conf >= 55) tags.push('Budget Friendly');

    const missing = ['position', 'age', 'minutes', 'rating', 'value', 'wage', 'goals', 'assists'].filter(key =>
      key === 'position' ? !String(player.position || '').trim() : !finite(player[key])
    );
    return {
      ...player,
      identityKey: player.identityKey,
      positionGroup: group,
      positionGroups: positionGroups(player.position),
      scores: {
        performance: Math.round(performance),
        value: Math.round(value),
        financial: Math.round(financial),
        development: Math.round(development),
        roleFit: Math.round(fit),
        confidence: Math.round(conf),
        moneyball: Math.round(clamp(moneyball))
      },
      scoreMeta: {
        comparisonGroup: group,
        comparisonSize: peers.length,
        minutesBand: !finite(player.minutes) || player.minutes <= 0 ? 'none' : player.minutes < 450 ? 'small' : player.minutes < 900 ? 'medium' : 'reliable',
        missing
      },
      tags
    };
  });
}

function compareToSquad(player, squad = []) {
  if (!Array.isArray(squad) || !squad.length) return null;
  const group = primaryPosition(player?.position);
  const weights = ROLE_WEIGHTS[group] || ROLE_WEIGHTS.Unknown;
  const hasEvidence = candidate => Object.keys(weights).some(metric => {
    if (metric === 'rating') return finite(candidate?.rating);
    return finite(candidate?.minutes) && candidate.minutes > 0 && finite(candidate?.[metric]);
  });
  if (!hasEvidence(player)) return null;
  const comparable = squad.filter(candidate => positionGroups(candidate.position).includes(group) && hasEvidence(candidate));
  if (!comparable.length) return null;
  const candidateScore = roleFit(player);
  const squadScores = comparable.map(candidate => roleFit(candidate));
  const squadAverage = squadScores.reduce((sum, score) => sum + score, 0) / squadScores.length;
  const squadBest = Math.max(...squadScores);
  return {
    group,
    squadCount: comparable.length,
    candidateScore: Math.round(candidateScore),
    squadAverage: Math.round(squadAverage),
    squadBest: Math.round(squadBest),
    deltaToAverage: Math.round(candidateScore - squadAverage),
    deltaToBest: Math.round(candidateScore - squadBest)
  };
}

function transferDecision(player, budget = 65000, maxWeeklyWage = 1000, squad = []) {
  const scores = player && player.scores ? player.scores : {};
  const transferBudget = finite(budget) && budget >= 0 ? budget : 0;
  const wageBudget = finite(maxWeeklyWage) && maxWeeklyWage >= 0 ? maxWeeklyWage : 0;
  const valueKnown = finite(player?.value) && player.value >= 0;
  const wageKnown = finite(player?.wage) && player.wage >= 0;
  const financesKnown = valueKnown && wageKnown;
  const withinTransferBudget = valueKnown && player.value <= transferBudget;
  const withinWageBudget = wageKnown && player.wage <= wageBudget;
  const affordable = financesKnown && withinTransferBudget && withinWageBudget;
  const moneyball = finite(scores.moneyball) ? scores.moneyball : 0;
  const confidenceScore = finite(scores.confidence) ? scores.confidence : 0;
  const squadComparison = compareToSquad(player, squad);

  const bidFactor = clamp(0.85 + (moneyball - 50) / 150, 0.75, 1.2);
  const wageFactor = clamp(1 + (moneyball - 60) / 250, 0.9, 1.15);
  const maxBid = valueKnown ? Math.round(Math.min(transferBudget, player.value * bidFactor)) : null;
  const maxWage = wageKnown ? Math.round(Math.min(wageBudget, player.wage * wageFactor)) : null;
  const firstYearCost = financesKnown ? Math.round(player.value + player.wage * 52) : null;
  const budgetImpact = financesKnown && transferBudget > 0 ? Math.round((player.value / transferBudget) * 100) : null;

  let verdict = 'PASS';
  if ((valueKnown && !withinTransferBudget) || (wageKnown && !withinWageBudget)) verdict = 'PASS';
  else if (!financesKnown) verdict = moneyball >= 62 ? 'WATCH' : 'PASS';
  else if (affordable && moneyball >= 80 && confidenceScore >= 75) verdict = 'BUY';
  else if (affordable && moneyball >= 70 && confidenceScore >= 60) verdict = 'CONSIDER';
  else if (affordable && (moneyball >= 62 || confidenceScore < 60)) verdict = 'WATCH';

  const reasons = [];
  const risks = [];
  if (scores.performance >= 70) reasons.push('Starke relative Leistung');
  if (scores.value >= 70 && valueKnown) reasons.push('Gutes Preis-Leistungs-Verhältnis');
  if (scores.roleFit >= 70) reasons.push('Gute Eignung für die Positionsgruppe');
  if (scores.development >= 70 && finite(player?.age)) reasons.push('Interessantes Entwicklungspotenzial');
  if (squadComparison && squadComparison.deltaToAverage >= 8 && confidenceScore >= 60) reasons.push(`Stärkeres Rollenprofil als der Kaderschnitt auf ${squadComparison.group}`);
  if (confidenceScore < 60) risks.push('Datenlage zu unsicher für eine positive Empfehlung');
  if (!valueKnown) risks.push('Marktwert fehlt');
  else if (!withinTransferBudget) risks.push('Marktwert übersteigt das Transferbudget');
  if (valueKnown) risks.push('Ablöse wird mangels Angebotsdaten durch den Marktwert angenähert');
  if (!wageKnown) risks.push('Gehaltsforderung fehlt');
  else if (!withinWageBudget) risks.push('Gehalt übersteigt die Clubgrenze');
  else if (wageBudget > 0 && player.wage > wageBudget * 0.8) risks.push('Hohe Auslastung des Gehaltslimits');
  if (player?.scoreMeta?.comparisonSize && player.scoreMeta.comparisonSize < 4) risks.push('Sehr kleine Vergleichsgruppe');
  if (moneyball < 62) risks.push('Moneyball-Profil unterhalb der Beobachtungsschwelle');
  if (squadComparison && squadComparison.deltaToAverage <= -8) risks.push(`Rollenprofil unter dem Kaderschnitt auf ${squadComparison.group}`);

  return {
    verdict,
    maxBid,
    maxWage,
    firstYearCost,
    budgetImpact,
    affordable,
    financesKnown,
    constraints: { withinTransferBudget, withinWageBudget },
    squadComparison,
    reasons,
    risks
  };
}

module.exports = {
  clamp,
  per90,
  percentile,
  positionGroups,
  primaryPosition,
  roleFit,
  confidence,
  scoreDataset,
  compareToSquad,
  transferDecision
};
