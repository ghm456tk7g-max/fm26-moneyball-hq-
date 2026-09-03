export type DatasetType = 'targets' | 'squad';
export type Verdict = 'BUY' | 'CONSIDER' | 'WATCH' | 'PASS';

export type Scores = {
  performance: number;
  value: number;
  financial: number;
  development: number;
  roleFit: number;
  confidence: number;
  moneyball: number;
};

export type ScoreMeta = {
  comparisonGroup?: string;
  comparisonSize?: number;
  minutesBand?: 'none' | 'small' | 'medium' | 'reliable';
  missing?: string[];
  positionGroups?: string[];
};

export type Player = {
  id: number;
  name: string;
  club: string;
  position: string;
  positionGroup: string;
  positionGroups?: string[];
  age: number | null;
  apps?: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  rating: number | null;
  value: number | null;
  wage: number | null;
  scores: Scores;
  scoreMeta?: ScoreMeta;
  tags: string[];
  shortlisted: boolean;
};

export type Settings = {
  transferBudget: number;
  maxWeeklyWage: number;
  formation: string;
};

export type TransferDecision = {
  verdict: Verdict;
  maxBid: number | null;
  maxWage: number | null;
  firstYearCost: number | null;
  budgetImpact: number | null;
  affordable: boolean;
  financesKnown: boolean;
  constraints: { withinTransferBudget: boolean; withinWageBudget: boolean };
  squadComparison: null | {
    group: string;
    squadCount: number;
    candidateScore: number;
    squadAverage: number;
    squadBest: number;
    deltaToAverage: number;
    deltaToBest: number;
  };
  reasons: string[];
  risks: string[];
};

export type ImportResult = {
  canceled: boolean;
  rowCount?: number;
  sourceRowCount?: number;
  duplicateCount?: number;
  warnings?: string[];
  encoding?: string;
  delimiter?: string;
};

export const money = (number: number | null | undefined) => number == null
  ? 'Unbekannt'
  : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(number);

export const scoreClass = (number: number) => number >= 80 ? 'good' : number >= 65 ? 'mid' : 'bad';

export function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || 'Unbekannter Fehler');
  return text.replace(/^Error invoking remote method '[^']+': Error:\s*/i, '');
}
