/**
 * PHASE 26 — EVENT MARKET REACTION ANALYZER
 * =========================================
 * Deterministically observes historical price returns, volume surges, and
 * benchmark-relative movements around verified events.
 *
 * EPISTEMOLOGICAL GUARD:
 *   - Strictly non-causal: "Observed market movement following event date",
 *     NEVER "Event caused price to move X%".
 */

import type {
  ObservedEventMarketReaction,
  EventWindowMetric,
} from './types.ts';
import type { CandlePoint } from '../indicators/types.ts';

export class EventShockAnalyzer {
  public static readonly VERSION = 'v1.0.0-phase26';
  public static readonly DISCLAIMER =
    'Quan sát biến động thị giá xung quanh sự kiện chỉ phản ánh tương quan giá và khối lượng thực tế trong quá khứ, không khẳng định quan hệ nhân quả trực tiếp hay dự phóng xu hướng tương lai.';

  /**
   * Computes empirical window returns around event date T0.
   */
  public static analyzeEventShock(
    eventId: string,
    symbol: string,
    eventType: string,
    eventDate: string,
    stockCandles: readonly CandlePoint[],
    benchmarkCandles?: readonly CandlePoint[]
  ): ObservedEventMarketReaction {
    const sym = symbol.toUpperCase();

    if (stockCandles.length === 0) {
      return {
        eventId,
        symbol: sym,
        eventType,
        eventDate,
        windowMetrics: [],
        preEventVolatility: null,
        postEventVolatility: null,
        maximumDrawdownPercent: null,
        recoveryDaysToPreEventPrice: null,
        marketDataStatus: 'UNAVAILABLE',
        disclaimer: this.DISCLAIMER,
      };
    }

    // Sort ascending by time
    const sorted = [...stockCandles].sort((a, b) => (String(a.time) > String(b.time) ? 1 : -1));
    const sortedBench = benchmarkCandles
      ? [...benchmarkCandles].sort((a, b) => (String(a.time) > String(b.time) ? 1 : -1))
      : [];

    // Find T0 index
    let t0Idx = sorted.findIndex((c) => String(c.time).slice(0, 10) >= eventDate);
    if (t0Idx === -1) {
      t0Idx = sorted.length - 1;
    }

    const t0Candle = sorted[t0Idx];
    const t0Price = t0Candle.close;

    // Calculate baseline SMA20 volume prior to T0
    const preT0VolumeSlices = sorted.slice(Math.max(0, t0Idx - 20), t0Idx);
    const avgSma20Vol =
      preT0VolumeSlices.length > 0
        ? preT0VolumeSlices.reduce((sum, c) => sum + c.volume, 0) / preT0VolumeSlices.length
        : t0Candle.volume;

    const windows: Array<{ label: EventWindowMetric['window']; offset: number }> = [
      { label: 'T-20', offset: -20 },
      { label: 'T-10', offset: -10 },
      { label: 'T-5', offset: -5 },
      { label: 'T0', offset: 0 },
      { label: 'T+1', offset: 1 },
      { label: 'T+5', offset: 5 },
      { label: 'T+10', offset: 10 },
      { label: 'T+20', offset: 20 },
      { label: 'T+60', offset: 60 },
    ];

    const windowMetrics: EventWindowMetric[] = [];

    for (const w of windows) {
      const targetIdx = t0Idx + w.offset;
      if (targetIdx < 0 || targetIdx >= sorted.length) {
        windowMetrics.push({
          window: w.label,
          priceReturnPercent: null,
          volumeVsSma20Ratio: null,
          benchmarkRelativeReturnPercent: null,
          netForeignBuyVolume: null,
        });
        continue;
      }

      const candle = sorted[targetIdx];
      const priceReturn = Number((((candle.close - t0Price) / t0Price) * 100).toFixed(2));
      const volRatio = avgSma20Vol > 0 ? Number((candle.volume / avgSma20Vol).toFixed(2)) : null;

      // Benchmark relative return
      let benchRelReturn: number | null = null;
      if (sortedBench.length > 0) {
        const b0 = sortedBench.find((b) => String(b.time).slice(0, 10) === String(t0Candle.time).slice(0, 10));
        const bTarget = sortedBench.find((b) => String(b.time).slice(0, 10) === String(candle.time).slice(0, 10));
        if (b0 && bTarget && b0.close > 0) {
          const benchReturn = ((bTarget.close - b0.close) / b0.close) * 100;
          benchRelReturn = Number((priceReturn - benchReturn).toFixed(2));
        }
      }

      windowMetrics.push({
        window: w.label,
        priceReturnPercent: priceReturn,
        volumeVsSma20Ratio: volRatio,
        benchmarkRelativeReturnPercent: benchRelReturn,
        netForeignBuyVolume: null,
      });
    }

    // Post-event max drawdown from T0 price
    let maxDrawdown: number | null = null;
    let recoveryDays: number | null = null;
    const postCandles = sorted.slice(t0Idx);

    if (postCandles.length > 1) {
      let lowestPost = t0Price;
      for (let i = 1; i < postCandles.length; i++) {
        const c = postCandles[i];
        if (c.close < lowestPost) {
          lowestPost = c.close;
        }
        if (recoveryDays === null && lowestPost < t0Price && c.close >= t0Price) {
          recoveryDays = i;
        }
      }
      maxDrawdown = Number((((lowestPost - t0Price) / t0Price) * 100).toFixed(2));
    }

    return {
      eventId,
      symbol: sym,
      eventType,
      eventDate,
      windowMetrics,
      preEventVolatility: null,
      postEventVolatility: null,
      maximumDrawdownPercent: maxDrawdown,
      recoveryDaysToPreEventPrice: recoveryDays,
      marketDataStatus: 'COMPLETE',
      disclaimer: this.DISCLAIMER,
    };
  }
}
