export type MarketState = 'PRE_OPEN' | 'TRADING' | 'LUNCH_BREAK' | 'CLOSING_ATC' | 'CLOSED';

export interface MarketStatus {
  state: MarketState;
  stateLabel: string;
  sessionName: string;
  timestamp: string;
  isDemo: boolean;
}

export interface IndexData {
  symbol: string;
  displayName: string;
  value: number;
  change: number;
  changePercent: number;
  totalVolume: number;
  totalValue: number;
  advances: number;
  declines: number;
  unchanged: number;
  ceilings: number;
  floors: number;
  status: string;
  sparkline?: number[];
  isDemo?: boolean;
}

export interface MarketSentiment {
  score: number;
  label: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  advances: number;
  declines: number;
  foreignNetBuyVND: number;
  putCallRatio?: number;
}

export interface MarketBreadth {
  advances: number;
  declines: number;
  unchanged: number;
  advanceVolume: number;
  declineVolume: number;
  unchangedVolume: number;
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
}

export interface AIMarketSummary {
  summary: string;
  sentiment: string;
  riskLevel: string;
  keyObservations: string[];
  topOpportunities: string[];
  generatedAt: string;
  sourceTimestamp?: string;
}

export interface AITopSignal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  horizon: string;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  reason: string;
  timeframe: string;
}
