export type MarketState = 'TRADING' | 'CLOSED';

export interface IndexData {
  symbol: 'VN-INDEX' | 'VN30' | 'HNX-INDEX' | 'UPCOM-INDEX';
  displayName: string;
  value: number;
  change: number;
  changePercent: number;
  totalVolume: number;
  totalValue: number; // in billion VND
  advances: number;
  declines: number;
  unchanged: number;
  ceilings: number;
  floors: number;
  status: MarketState;
  sparkline: number[];
  isDemo: true;
}

export interface MarketStatus {
  state: MarketState;
  stateLabel: 'ĐANG GIAO DỊCH' | 'ĐÓNG CỬA';
  sessionName: 'Phiên sáng' | 'Phiên chiều' | 'Khớp lệnh liên tục' | 'Phiên ATC' | 'Đã đóng cửa';
  timestamp: string;
  isDemo: true;
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
  isDemo: true;
}

export interface MarketSentiment {
  score: number; // 0 - 100
  label: 'CỰC KỲ BI QUAN' | 'BI QUAN' | 'TRUNG TÍNH' | 'LẠC QUAN' | 'HƯNG PHẤN';
  status: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  description: string;
  momentum: 'MẠNH' | 'TRUNG BÌNH' | 'YẾU';
  liquidityTrend: string;
  foreignFlow: {
    netValue: number; // in billion VND
    type: 'NET_BUY' | 'NET_SELL';
    label: string;
  };
  proprietaryFlow: {
    netValue: number;
    type: 'NET_BUY' | 'NET_SELL';
    label: string;
  };
  retailFlow: {
    netValue: number;
    type: 'NET_BUY' | 'NET_SELL';
    label: string;
  };
  shortTermOutlook: string;
  keyFactors: string[];
  updatedAt: string;
  isDemo: true;
}

export interface MarketBreadth {
  advances: number;
  ceilings: number;
  declines: number;
  floors: number;
  unchanged: number;
  totalStocks: number;
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
  isDemo: true;
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
  targetPrice: number;
  stopLossPrice: number;
  upsidePercent: number;
  riskRewardRatio: string;
  timeframe: string;
  catalysts: string[];
  technicalSummary: string;
  updatedAt: string;
  isDemo: true;
}
