import { CandleInput } from '../common/types.ts';
import {
  validateCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateVolumeRatio,
} from './indicators.ts';
import { TechnicalScoreEngine, TechnicalScoreResult } from './TechnicalScoreEngine.ts';
import { calculateSupportResistance, SupportResistanceResult } from './supportResistance.ts';

export type SignalType = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
export interface PricePosition {
  distSma20: number | null;
  distSma50: number | null;
  distSma200: number | null;
  dist52WeekHigh: number | null;
  dist52WeekLow: number | null;
}

export interface AnalysisIndicators {
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  atr14: number | null;
  volumeRatio: number | null;
  avgVolume20: number | null;
  currentVolume: number | null;
}

export interface StockAnalysisResult {
  score: number;
  signal: SignalType;
  confidence: number;
  reasons: string[];
  risks: string[];
  indicators: AnalysisIndicators;
  supportResistance: SupportResistanceResult;
  pricePosition: PricePosition;
  technicalScore: TechnicalScoreResult;
}

export interface StockAnalysisInput {
  candles: CandleInput[];
  high52Week?: number | null;
  low52Week?: number | null;
}
function getSignalFromScore(score: number): SignalType {
  if (score >= 80) return 'STRONG_BUY';
  if (score >= 65) return 'BUY';
  if (score >= 45) return 'HOLD';
  if (score >= 30) return 'SELL';
  return 'STRONG_SELL';
}

function calcConfidence(valid: CandleInput[], ind: AnalysisIndicators, ts: TechnicalScoreResult): number {
  let dq = 0;
  const n = valid.length;
  if (n >= 200) dq = 50;
  else if (n >= 100) dq = 40;
  else if (n >= 50) dq = 30;
  else if (n >= 20) dq = 20;
  else dq = 10;
  const vals = [ts.breakdown.trend, ts.breakdown.momentum, ts.breakdown.volume, ts.breakdown.rsi, ts.breakdown.macd, ts.breakdown.support, ts.breakdown.breakout];
  const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a: number, b: number) => a + (b - avg) ** 2, 0) / vals.length);
  let ia = 50;
  if (std <= 10) ia = 50;
  else if (std <= 20) ia = 40;
  else if (std <= 30) ia = 30;
  else if (std <= 40) ia = 20;
  else ia = 10;
  return Math.min(100, Math.max(0, dq + ia));
}
function calcPricePosition(valid: CandleInput[], h52: number | null | undefined, l52: number | null | undefined): PricePosition {
  const price = valid[valid.length - 1].close;
  const s20 = calculateSMA(valid, 20);
  const s50 = calculateSMA(valid, 50);
  const s200 = calculateSMA(valid, 200);
  const v20 = s20.length > 0 ? s20[s20.length - 1].value : null;
  const v50 = s50.length > 0 ? s50[s50.length - 1].value : null;
  const v200 = s200.length > 0 ? s200[s200.length - 1].value : null;
  return {
    distSma20: v20 != null ? +((price - v20) / v20 * 100).toFixed(2) : null,
    distSma50: v50 != null ? +((price - v50) / v50 * 100).toFixed(2) : null,
    distSma200: v200 != null ? +((price - v200) / v200 * 100).toFixed(2) : null,
    dist52WeekHigh: h52 != null ? +((price - h52) / h52 * 100).toFixed(2) : null,
    dist52WeekLow: l52 != null ? +((price - l52) / l52 * 100).toFixed(2) : null,
  };
}
function calcRisks(valid: CandleInput[], ind: AnalysisIndicators, sr: SupportResistanceResult, ts: TechnicalScoreResult, pos: PricePosition): string[] {
  const risks: string[] = [];
  const price = valid[valid.length - 1].close;
  if (ind.rsi14 !== null) {
    if (ind.rsi14 > 70) risks.push("RSI overbought (" + ind.rsi14.toFixed(1) + "), profit-taking pressure");
    if (ind.rsi14 < 30) risks.push("RSI oversold (" + ind.rsi14.toFixed(1) + "), selling pressure");
  }
  if (ind.atr14 !== null && price > 0) {
    const atrPct = (ind.atr14 / price) * 100;
    if (atrPct > 5) risks.push("High volatility (" + atrPct.toFixed(1) + "%), deep drawdown risk");
  }
  if (pos.distSma200 !== null && pos.distSma200 < 0) risks.push("Price below MA200, long-term trend weak");
  const nearRes = sr.resistance.filter(r => r.price > price).sort((a, b) => a.price - b.price)[0];
  if (nearRes && ((nearRes.price - price) / price * 100) < 3) risks.push("Near resistance (" + nearRes.price.toLocaleString("vi-VN") + " VND)");
  if (ind.volumeRatio !== null && ind.volumeRatio < 0.6) risks.push("Low volume (" + ind.volumeRatio.toFixed(2) + "x avg), weak liquidity");
  if (pos.dist52WeekHigh !== null && pos.dist52WeekHigh > -2) risks.push("Near 52-week high, supply zone");
  if (pos.dist52WeekLow !== null && pos.dist52WeekLow < 5 && pos.dist52WeekLow >= 0) risks.push("Near 52-week low, continued selling");
  risks.push(...ts.warnings.slice(0, 3));
  return risks;
}
function extractIndicators(valid: CandleInput[]): AnalysisIndicators {
  const s20 = calculateSMA(valid, 20); const s50 = calculateSMA(valid, 50);
  const s100 = calculateSMA(valid, 100); const s200 = calculateSMA(valid, 200);
  const e20 = calculateEMA(valid, 20); const e50 = calculateEMA(valid, 50);
  const rsi = calculateRSI(valid, 14); const macd = calculateMACD(valid, 12, 26, 9);
  const bb = calculateBollingerBands(valid, 20, 2); const atr = calculateATR(valid, 14);
  const vr = calculateVolumeRatio(valid, 20);
  return {
    sma20: s20.length > 0 ? s20[s20.length - 1].value : null,
    sma50: s50.length > 0 ? s50[s50.length - 1].value : null,
    sma100: s100.length > 0 ? s100[s100.length - 1].value : null,
    sma200: s200.length > 0 ? s200[s200.length - 1].value : null,
    ema20: e20.length > 0 ? e20[e20.length - 1].value : null,
    ema50: e50.length > 0 ? e50[e50.length - 1].value : null,
    rsi14: rsi.length > 0 ? rsi[rsi.length - 1].value : null,
    macdLine: macd.length > 0 ? macd[macd.length - 1].macd : null,
    macdSignal: macd.length > 0 ? macd[macd.length - 1].signal : null,
    macdHistogram: macd.length > 0 ? macd[macd.length - 1].histogram : null,
    bollingerUpper: bb.length > 0 ? bb[bb.length - 1].upper : null,
    bollingerMiddle: bb.length > 0 ? bb[bb.length - 1].middle : null,
    bollingerLower: bb.length > 0 ? bb[bb.length - 1].lower : null,
    atr14: atr.length > 0 ? atr[atr.length - 1].value : null,
    volumeRatio: vr ? vr.ratio : null,
    avgVolume20: vr ? vr.volumeSMA : null,
    currentVolume: vr ? vr.currentVolume : null,
  };
}
export class StockAnalysisEngine {
  static analyze(input: StockAnalysisInput): StockAnalysisResult {
    const { candles, high52Week = null, low52Week = null } = input;
    const valid = validateCandles(candles);
    if (valid.length === 0) {
      const ts = TechnicalScoreEngine.evaluate(valid);
      return {
        score: 0, signal: 'STRONG_SELL', confidence: 0,
        reasons: ['No valid candle data.'], risks: ['Data empty, cannot analyze.'],
        indicators: {
          sma20: null, sma50: null, sma100: null, sma200: null,
          ema20: null, ema50: null, rsi14: null,
          macdLine: null, macdSignal: null, macdHistogram: null,
          bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
          atr14: null, volumeRatio: null, avgVolume20: null, currentVolume: null,
        },
        supportResistance: { support: [], resistance: [] },
        pricePosition: { distSma20: null, distSma50: null, distSma200: null, dist52WeekHigh: null, dist52WeekLow: null },
        technicalScore: ts,
      };
    }
    const indicators = extractIndicators(valid);
    const techScore = TechnicalScoreEngine.evaluate(valid);
    const supportResistance = calculateSupportResistance(valid);
    const pricePosition = calcPricePosition(valid, high52Week, low52Week);
    const signal = getSignalFromScore(techScore.score);
    const confidence = calcConfidence(valid, indicators, techScore);
    const risks = calcRisks(valid, indicators, supportResistance, techScore, pricePosition);
    return {
      score: techScore.score, signal, confidence,
      reasons: techScore.reasons, risks,
      indicators, supportResistance, pricePosition,
      technicalScore: techScore,
    };
  }
}