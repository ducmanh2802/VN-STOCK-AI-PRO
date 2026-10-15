export interface CandlePoint {
  time: string | number; // 'YYYY-MM-DD' or timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: string | number;
  value: number;
}

export interface MACDPoint {
  time: string | number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandsPoint {
  time: string | number;
  upper: number;
  middle: number;
  lower: number;
  pb: number;
  bandwidth: number;
}

export interface VolumeBarPoint {
  time: string | number;
  value: number;
  color: string;
  volumeMA?: number;
}

export interface IndicatorSnapshot {
  rsi: {
    value: number;
    status: 'OVERSOLD' | 'BEARISH' | 'NEUTRAL' | 'BULLISH' | 'OVERBOUGHT';
    label: string;
  };
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
    trend: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'BULLISH' | 'BEARISH' | null;
    label: string;
  };
  sma20: {
    value: number;
    priceRelation: 'ABOVE' | 'BELOW';
    diffPercent: number;
  };
  sma50: {
    value: number | null;
    priceRelation: 'ABOVE' | 'BELOW' | null;
    diffPercent: number | null;
  };
  sma200: {
    value: number | null;
    priceRelation: 'ABOVE' | 'BELOW' | null;
    diffPercent: number | null;
    goldenCross: boolean | null;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    pb: number;
    bandwidth: number;
    status: 'EXPANDING' | 'SQUEEZE' | 'TESTING_UPPER' | 'TESTING_LOWER' | 'NORMAL';
    label: string;
  };
  volume: {
    current: number;
    ma20: number | null;
    ratioToMA: number | null;
    trend: 'SURGE' | 'NORMAL' | 'DRY' | null;
  };
}
