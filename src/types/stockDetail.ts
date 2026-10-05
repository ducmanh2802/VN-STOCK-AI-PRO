import { StockSummary, MarketExchange, StockTrend } from './stock';

export type TimeframeOption = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y';

export type IndicatorKey = 'MA20' | 'MA50' | 'MA200' | 'RSI' | 'MACD' | 'Volume' | 'Bollinger';

/**
 * P0-03 availability contract.
 * - `REAL`               backed directly by provider data
 * - `DERIVED`            computed from authoritative data by a documented deterministic rule
 * - `NOT_COMPUTED`       the required engine/source is not reachable from this path
 * - `UNAVAILABLE`        no source supplied the input
 * - `DEMO`               fixture data, explicitly flagged as non-production
 */
export type EvidenceStatus = 'REAL' | 'DERIVED' | 'NOT_COMPUTED' | 'UNAVAILABLE' | 'DEMO';

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
  /** P0-03: million shares. `null` when no authoritative shares-outstanding source exists. */
  sharesOutstanding: number | null;
  /** P0-03: billion VND. `null` when shares outstanding are unavailable. */
  marketCapBillion: number | null;
}

/**
 * P0-03: every valuation figure is nullable and carries an explicit status.
 * A fair value, DCF value, multiple-based value or Graham value is only populated
 * when an actual valuation model produced it. `price x 1.18` and friends are
 * never presented as certified valuation.
 */
export interface ValuationData {
  currentPrice: number;
  fairValue: number | null;
  dcfValue: number | null;
  peMultipleValue: number | null;
  pbBookValue: number | null;
  grahamValue: number | null;
  consensusTarget: number | null;
  marginOfSafety: number | null; // % e.g. +19.4%
  valuationRating: 'UNDERVALUED' | 'FAIR' | 'OVERVALUED' | 'NOT_COMPUTED';
  valuationStatus: EvidenceStatus;
  valuationProvenance: string;
  valuationNote: string;
}

/** P0-03: money-flow figures are nullable; missing sources are never faked. */
export interface MoneyFlowData {
  largeOrderPercent: number | null; // Cá mập > 1 tỷ VND
  mediumOrderPercent: number | null; // Sói già 200tr - 1 tỷ VND
  smallOrderPercent: number | null; // Nhỏ lẻ < 200tr VND
  foreignNetValue: number | null; // billion VND (+ net buy, - net sell)
  foreignBuyValue: number | null;
  foreignSellValue: number | null;
  propTradingNetValue: number | null; // Tự doanh in billion VND
  activeBuyVolume: number | null;
  activeSellVolume: number | null;
  netFlowVolume: number | null;
  orderPressureRatio: number | null;
  moneyFlowStatus: EvidenceStatus;
  moneyFlowProvenance: string;
}

export interface SupportResistanceLevels {
  r3: number;
  r2: number;
  r1: number;
  pivot: number;
  s1: number;
  s2: number;
  s3: number;
  ma20Level: number | null;
  ma50Level: number | null;
  ma200Level: number | null;
  nearestSupport: number;
  nearestResistance: number;
  supportDistancePercent: number;
  resistanceDistancePercent: number;
}

/**
 * P0-03: targets and stops are nullable. They are populated only when an
 * authoritative risk/target model backs them; this UI path has none, so they are
 * `null` and the ratio is `null` — never a fixed multiplier or a `'1 : 2.5'` default.
 */
export interface RiskRewardData {
  entryPrice: number;
  stopLossPrice: number | null;
  targetPrice1: number | null;
  targetPrice2: number | null;
  riskAmount: number | null; // in VND
  rewardAmount: number | null; // in VND
  riskRewardRatio: string | null; // e.g. "1 : 2.8"
  maxRiskPercent: number | null; // % e.g. -5.2%
  potentialGainPercent: number | null; // % e.g. +16.8%
  suggestedPositionSizeShares: number | null;
  riskRewardStatus: EvidenceStatus;
  riskRewardProvenance: string;
}

export interface StockAISignalData {
  signalType: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD' | 'SELL' | 'WATCH' | 'TAKE_PROFIT';
  signalLabel: string;
  aiScore: number; // 0 - 100
  /** P0-03: `null` when no model confidence is computed (never a fixed 88). */
  confidence: number | null; // % e.g. 88%
  timeframe: string;
  targetPrice: number | null;
  stopLossPrice: number | null;
  upsidePercent: number | null;
  riskRewardRatio: string | null;
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
  /** P0-03: `null` when no authoritative free-float / room source is reachable. */
  foreignOwnershipPercent: number | null;
  roomRemainingPercent: number | null;
}
