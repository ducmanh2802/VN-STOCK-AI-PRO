export type InvestmentHorizon = 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
export type RecommendationSignal = 'BUY' | 'SELL' | 'HOLD';

export interface ScoreWeights {
  technical: number;
  fundamental: number;
  momentum: number;
  moneyFlow: number;
  valuation: number;
  risk: number;
}

export const DEFAULT_WEIGHTS_BY_HORIZON: Record<InvestmentHorizon, ScoreWeights> = {
  SHORT_TERM: {
    technical: 0.35,
    momentum: 0.25,
    moneyFlow: 0.20,
    fundamental: 0.05,
    valuation: 0.05,
    risk: 0.10,
  },
  MEDIUM_TERM: {
    technical: 0.20,
    momentum: 0.15,
    moneyFlow: 0.15,
    fundamental: 0.25,
    valuation: 0.15,
    risk: 0.10,
  },
  LONG_TERM: {
    fundamental: 0.35,
    valuation: 0.30,
    moneyFlow: 0.10,
    technical: 0.10,
    momentum: 0.05,
    risk: 0.10,
  },
};

export const HORIZON_HOLDING_DAYS: Record<InvestmentHorizon, { min: number; max: number; target: number }> = {
  SHORT_TERM: { min: 3, max: 20, target: 10 },
  MEDIUM_TERM: { min: 21, max: 90, target: 45 },
  LONG_TERM: { min: 91, max: 365, target: 180 },
};

export const HORIZON_LABELS: Record<InvestmentHorizon, { vi: string; en: string; holding: string }> = {
  SHORT_TERM: { vi: 'Ngắn hạn (T+3 ~ T+20)', en: 'Short Term', holding: '3-20 ngày' },
  MEDIUM_TERM: { vi: 'Trung hạn (1 ~ 3 tháng)', en: 'Medium Term', holding: '1-3 tháng' },
  LONG_TERM: { vi: 'Dài hạn (6 ~ 12 tháng)', en: 'Long Term', holding: '6-12 tháng' },
};

export interface RecommendationScoreBreakdown {
  technical: number | null;
  fundamental: number | null;
  momentum: number | null;
  moneyFlow: number | null;
  valuation: number | null;
  risk: number | null;
  composite: number;
}

export interface AnalysisEvidence {
  summary: string;
  catalysts: string[];
  warnings: string[];
  risks: string[];
  metrics: Record<string, number | string | null>;
}

export interface InvestmentRecommendation {
  symbol: string;
  horizon: InvestmentHorizon;
  strategy?: InvestmentHorizon;
  signal: RecommendationSignal;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | number;
  currentPrice: number;
  entryPrice?: number;
  targetPrice: number | null;
  stopLoss: number | null;
  riskReward?: number | null;
  riskRewardRatio?: number | null;
  potentialUpside?: number | null;
  potentialDownside?: number | null;
  expectedReturn: number | null;
  riskAmount?: number | null;
  rewardAmount?: number | null;
  holdingPeriod?: number | null;
  holdingPeriodDays?: number | null;
  scoreBreakdown?: RecommendationScoreBreakdown;
  evidence?: AnalysisEvidence | any[];
  thesis?: string;
  reasons?: string[];
  catalysts?: string[];
  warnings?: string[];
  timestamp?: string;
  generatedAt?: string;
  asOfDate?: string;
  currency?: string;
}


export interface RecommendationRanking {
  rank: number;
  symbol: string;
  score: number;
  signal: RecommendationSignal;
  horizon: InvestmentHorizon;
  targetReturn: number | null;
}

export interface RankingRequest {
  horizon: InvestmentHorizon;
  limit?: number;
  sector?: string;
}

export interface RankingResult {
  horizon: InvestmentHorizon;
  rankings: RecommendationRanking[];
  generatedAt: string;
}
