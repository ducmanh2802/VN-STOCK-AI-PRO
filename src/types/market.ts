export type MarketState = 'TRADING' | 'CLOSED';

/**
 * P0-03: `value` / `change` / `sparkline` are nullable because a genuine index
 * level requires an authoritative index feed. When no such feed is reachable the
 * fields are `null` (UNAVAILABLE) — never a manufactured base such as
 * `price x constant`, an interpolated value, or yesterday's value reused as
 * current. `changePercent` remains a DERIVED value: it is the real
 * capital-weighted-free mean of constituent percentage changes.
 */
export interface IndexData {
  symbol: 'VN-INDEX' | 'VN30' | 'HNX-INDEX' | 'UPCOM-INDEX';
  displayName: string;
  value: number | null;
  change: number | null;
  /**
   * P27 §9: `changePercent` is derived from constituent moves, so it is `null`
   * when no constituent supplied a usable change — an empty basket is not a
   * "0.00% session".
   */
  changePercent: number | null;
  /** P27 §9: `null` when no constituent supplied a usable volume/value. */
  totalVolume: number | null;
  totalValue: number | null; // in billion VND
  advances: number;
  declines: number;
  unchanged: number;
  ceilings: number;
  floors: number;
  status: MarketState;
  sparkline: number[] | null;
  isDemo?: boolean;
  /** Provenance for `value`: which source backs the index level, or why it is absent. */
  levelSource: 'AUTHORITATIVE_INDEX_FEED' | 'UNAVAILABLE' | 'DEMO';
  levelProvenance: string;
}

export interface MarketStatus {
  state: MarketState;
  stateLabel: 'ĐANG GIAO DỊCH' | 'ĐÓNG CỬA';
  sessionName: 'Phiên sáng' | 'Phiên chiều' | 'Khớp lệnh liên tục' | 'Phiên ATC' | 'Đã đóng cửa';
  timestamp: string;
  isDemo?: boolean;
}

export interface AIMarketSummary {
  trend: 'TÍCH CỰC' | 'TRUNG TÍNH' | 'TIÊU CỰC';
  trendScore: number; // 0 - 100
  moneyFlow: string;
  strongSectors: string[];
  weakSectors: string[];
  riskAlerts: string[];
  overallComment: string;
  disclaimer: string;
  updatedAt: string;
  isDemo?: boolean;
}

/**
 * P0-03: a money-flow metric is only reported when it is backed by real provider
 * data, persisted history, or an authoritative derived calculation. Otherwise it
 * is `netValue: null` with `availability: 'UNAVAILABLE'` and an explicit
 * `provenance` reason — never a hardcoded number presented as a measured flow.
 */
export interface MoneyFlowMetric {
  /** in billion VND. `null` means UNAVAILABLE. */
  netValue: number | null;
  type: 'NET_BUY' | 'NET_SELL' | 'UNAVAILABLE';
  label: string;
  availability: 'REAL' | 'DERIVED' | 'UNAVAILABLE' | 'DEMO';
  provenance: string;
}

export interface MarketSentiment {
  score: number; // 0 - 100
  label: 'CỰC KỲ BI QUAN' | 'BI QUAN' | 'TRUNG TÍNH' | 'LẠC QUAN' | 'HƯNG PHẤN';
  status: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  description: string;
  momentum: 'MẠNH' | 'TRUNG BÌNH' | 'YẾU';
  liquidityTrend: string;
  foreignFlow: MoneyFlowMetric;
  proprietaryFlow: MoneyFlowMetric;
  retailFlow: MoneyFlowMetric;
  shortTermOutlook: string;
  keyFactors: string[];
  updatedAt: string;
  isDemo?: boolean;
}

export interface MarketBreadth {
  advances: number;
  ceilings: number;
  declines: number;
  floors: number;
  unchanged: number;
  totalStocks: number;
  /**
   * P27 §12: breadth is computed over the covered universe, not over every
   * listing on the exchanges. The coverage block makes that scope explicit so
   * partial breadth is never read as whole-market breadth.
   */
  coverage: {
    universe: string;
    /** Symbols in the covered universe. */
    coveredStocks: number;
    /** Symbols that supplied a usable change for this computation. */
    pricedStocks: number;
    percentPriced: number;
    note: string;
  };
  advanceDeclineRatio: number;
  breadthStatus: 'BÊN MUA CHIẾM ƯU THẾ' | 'CÂN BẰNG' | 'BÊN BÁN CHIẾM ƯU THẾ';
  volumeBreadth: {
    advancingValue: number; // in billion VND
    advancingPercent: number;
    decliningValue: number;
    decliningPercent: number;
    unchangedValue: number;
    unchangedPercent: number;
    totalValue: number;
  };
  exchangeBreakdown: {
    hose: { advances: number; declines: number; unchanged: number; ceilings: number; floors: number };
    vn30: { advances: number; declines: number; unchanged: number; ceilings: number; floors: number };
    hnx: { advances: number; declines: number; unchanged: number; ceilings: number; floors: number };
    upcom: { advances: number; declines: number; unchanged: number; ceilings: number; floors: number };
  };
  updatedAt: string;
  isDemo?: boolean;
}

export interface AITopSignal {
  id: string;
  symbol: string;
  companyName: string;
  exchange: 'HOSE' | 'HNX' | 'UPCOM';
  sector: string;
  signalType: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'WATCH' | 'HOLD' | 'TAKE_PROFIT' | 'SELL';
  signalLabel: string;
  aiScore: number; // 0 - 100
  confidence: number; // 0 - 100
  currentPrice: number;
  /**
   * P0-03: nullable. A target, stop, upside or R:R figure is only populated when an
   * actual valuation model or authoritative target feed backs it. Otherwise `null`
   * (UNAVAILABLE) — never `price x constant`, `0`, or an assumed multiple.
   */
  targetPrice: number | null;
  stopLossPrice: number | null;
  upsidePercent: number | null;
  riskRewardRatio: string | null;
  timeframe: string;
  catalysts: string[];
  technicalSummary: string;
  updatedAt: string;
  isDemo?: boolean;
}
