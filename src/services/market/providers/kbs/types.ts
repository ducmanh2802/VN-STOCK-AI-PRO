export interface NormalizedDailyBar {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value?: number;
}

export interface KbsRawCandle {
  d: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  val?: number;
}
