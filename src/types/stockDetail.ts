import { StockSummary, MarketExchange, StockTrend } from './stock';

export type TimeframeOption = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y';

export type IndicatorKey = 'MA20' | 'MA50' | 'MA200' | 'RSI' | 'MACD' | 'Volume' | 'Bollinger';

export interface FundamentalMetrics {
  pe: number;
  pb: number;
  eps: number; // in VND
  roe: number; // %
  roa: number; // %
  dividendYield: number; // %
  debtToEquity: number; // ratio e.g. 0.65
  revenueGrowthYoY: number; // % e.g. +18.5
  profitGrowthYoY: number; // % e.g. +24.2
  netMargin: number; // %
  grossMargin: number; // %
  sharesOutstanding: number; // million shares
  marketCapBillion: number; // in billion VND
}

export interface ValuationData {
  currentPrice: number;
  fairValue: number;
  dcfValue: number;
  peMultipleValue: number;
  pbBookValue: number;
  grahamValue: number;
  consensusTarget: number;
  marginOfSafety: number; // % e.g. +19.4%
  valuationRating: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED';
  valuationNote: string;
}

export interface MoneyFlowData {
  largeOrderPercent: number; // Cá mập > 1 tỷ VND
  mediumOrderPercent: number; // Sói già 200tr - 1 tỷ VND
  smallOrderPercent: number; // Nhỏ lẻ < 200tr VND
  foreignNetValue: number; // in billion VND (+ is net buy, - is net sell)
  foreignBuyValue: number;
  foreignSellValue: number;
  propTradingNetValue: number; // Tự doanh in billion VND
  activeBuyVolume: number;
  activeSellVolume: number;
  netFlowVolume: number;
  orderPressureRatio: number; // Active Buy / Active Sell ratio e.g. 1.35
}

export interface SupportResistanceLevels {
  r3: number;
  r2: number;
  r1: number;
  pivot: number;
  s1: number;
  s2: number;
  s3: number;
  ma20Level: number;
  ma50Level: number;
  ma200Level: number;
  nearestSupport: number;
  nearestResistance: number;
  supportDistancePercent: number;
  resistanceDistancePercent: number;
}

export interface RiskRewardData {
  entryPrice: number;
  stopLossPrice: number;
  targetPrice1: number;
  targetPrice2: number;
  riskAmount: number; // in VND
  rewardAmount: number; // in VND
  riskRewardRatio: string; // e.g. "1 : 2.8"
  maxRiskPercent: number; // % e.g. -5.2%
  potentialGainPercent: number; // % e.g. +16.8%
  suggestedPositionSizeShares?: number; // suggested based on 2% risk model
}

export interface StockAISignalData {
  signalType: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD' | 'SELL' | 'WATCH' | 'TAKE_PROFIT';
  signalLabel: string;
  aiScore: number; // 0 - 100
  confidence: number; // % e.g. 88%
  timeframe: string;
  targetPrice: number;
  stopLossPrice: number;
  upsidePercent: number;
  riskRewardRatio: string;
  catalysts: string[];
  riskWarnings: string[];
  technicalSummary: string;
  updatedAt: string;
}

export interface StockAIExplanationData {
  executiveThesis: string;
  technicalThesis: string;
  fundamentalThesis: string;
  macroThesis: string;
  keyRisks: string[];
}

export interface FullStockDetail extends StockSummary {
  fundamentals: FundamentalMetrics;
  valuation: ValuationData;
  moneyFlow: MoneyFlowData;
  supportResistance: SupportResistanceLevels;
  riskReward: RiskRewardData;
  aiSignal: StockAISignalData;
  aiExplanation: StockAIExplanationData;
  high52Week: number;
  low52Week: number;
  avgVolume20D: number;
  foreignOwnershipPercent: number;
  roomRemainingPercent: number;
}
