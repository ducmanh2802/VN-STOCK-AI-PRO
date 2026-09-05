import { describe, it, expect } from 'vitest';
import { StockAnalysisEngine } from '../StockAnalysisEngine.ts';
import { calculateSupportResistance } from '../supportResistance.ts';
import { CandleInput } from '../../common/types.ts';

function gen(n: number, p: number, t: number = 0.3): CandleInput[] {
  const r: CandleInput[] = []; let c = p;
  for (let i = 0; i < n; i++) {
    const ch = (Math.sin(i / 4) + t) * p * 0.01;
    const o = c; const cl = o + ch;
    r.push({ time: '2026-01-' + String(i+1).padStart(2,'0'),
      open: +o.toFixed(2), high: +(Math.max(o,cl)+p*0.008).toFixed(2),
      low: +(Math.min(o,cl)-p*0.006).toFixed(2), close: +cl.toFixed(2),
      volume: 1000000 + Math.floor(Math.abs(Math.sin(i))*500000) });
    c = cl;
  }
  return r;
}

describe('StockAnalysisEngine', () => {
  const bull = gen(100, 50000, 0.5);
  const bear = gen(100, 50000, -0.5);

  it('analyzes bullish data', () => {
    const r = StockAnalysisEngine.analyze({ candles: bull });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(['STRONG_BUY','BUY','HOLD','SELL','STRONG_SELL']).toContain(r.signal);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('analyzes bearish data', () => {
    const r = StockAnalysisEngine.analyze({ candles: bear });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('extracts indicators', () => {
    const r = StockAnalysisEngine.analyze({ candles: bull });
    expect(r.indicators.sma20).not.toBeNull();
    expect(r.indicators.rsi14).not.toBeNull();
    expect(r.indicators.atr14).not.toBeNull();
    expect(r.indicators.volumeRatio).not.toBeNull();
  });

  it('handles empty data', () => {
    const r = StockAnalysisEngine.analyze({ candles: [] });
    expect(r.score).toBe(0);
    expect(r.signal).toBe('STRONG_SELL');
    expect(r.confidence).toBe(0);
  });

  it('handles corrupt data', () => {
    const bad: any[] = [{ open: 10, high: 12, low: 9, close: 11, volume: 1000 },{ open: NaN, high: 12, low: 9, close: 11, volume: 1000 }];
    const r = StockAnalysisEngine.analyze({ candles: bad });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('calculates support/resistance', () => {
    const r = StockAnalysisEngine.analyze({ candles: bull });
    expect(Array.isArray(r.supportResistance.support)).toBe(true);
    expect(Array.isArray(r.supportResistance.resistance)).toBe(true);
  });

  it('calculates price position', () => {
    const r = StockAnalysisEngine.analyze({ candles: bull, high52Week: 60000, low52Week: 40000 });
    expect(r.pricePosition.distSma20).not.toBeNull();
    expect(r.pricePosition.dist52WeekHigh).not.toBeNull();
  });

  it('generates risks', () => {
    const r = StockAnalysisEngine.analyze({ candles: bull });
    expect(Array.isArray(r.risks)).toBe(true);
  });
});
