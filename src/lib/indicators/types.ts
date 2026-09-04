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
    macd: number;
    signal: number;
    histogram: number;
    trend: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'BULLISH' | 'BEARISH';
    label: string;
  };
  sma20: {
    value: number;
    priceRelation: 'ABOVE' | 'BELOW';
    diffPercent: number;
  };
  sma50: {
    value: number;
    priceRelation: 'ABOVE' | 'BELOW';
    diffPercent: number;
  };
  sma200: {
    value: number;
    priceRelation: 'ABOVE' | 'BELOW';
    diffPercent: number;
    goldenCross: boolean;
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
    ma20: number;
    ratioToMA: number; // e.g. 1.45x
    trend: 'SURGE' | 'NORMAL' | 'DRY';
  };
}
