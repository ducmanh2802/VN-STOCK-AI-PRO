import type { StockSummary } from './stock';

export type TimeframeOption = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

export type IndicatorKey = 'MA20' | 'MA50' | 'MA200' | 'EMA20' | 'BOLLINGER' | 'RSI' | 'MACD';

export interface ValuationData {
  currentPrice: number;
  fairValue: number;
  valuationRating: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
  dcfValue?: number;
  peMultipleValue?: number;
  grahamValue?: number;
  consensusTarget?: number;
  marginOfSafety?: number;
  upsidePercent?: number;
}

export interface RiskRewardData {
  entryPrice: number;
  stopLossPrice: number;
  targetPrice1: number;
  targetPrice2?: number;
  maxRiskPercent: number;
  potentialGainPercent: number;
  riskAmount?: number;
  rewardAmount?: number;
  riskRewardRatio: number;
}

export interface MoneyFlowData {
  activeBuyVolume: number;
  activeSellVolume: number;
  orderPressureRatio: number;
  foreignNetValue: number;
  foreignBuyValue?: number;
  foreignSellValue?: number;
  foreignNetVolume?: number;
  trend?: string;
  smartMoneyInflow?: boolean;
}

export interface SupportResistanceLevels {
  nearestSupport: number;
  nearestResistance: number;
  supportDistancePercent: number;
  resistanceDistancePercent: number;
  supportLevels?: number[];
  resistanceLevels?: number[];
}

export interface FullStockDetail {
  symbol: string;
  summary: StockSummary;
  overview?: Record<string, unknown>;
  financials?: Record<string, unknown>;
  valuation?: ValuationData;
  technical?: Record<string, unknown>;
  orderBook?: Record<string, unknown>;
  historicalData?: Record<string, unknown>;
}

export interface StockAISignalData {
  signalType: 'BUY' | 'ACCUMULATE' | 'HOLD' | 'SELL';
  aiScore: number;
  confidence: number;
  targetPrice: number;
  stopLossPrice: number;
  upsidePercent: number;
  timeHorizon?: string;
  reasoning?: string[];
  reasons?: string[];
  warnings?: string[];
}

