/**
 * PHASE 20.3 & 20.4 — CANONICAL SECTOR INTELLIGENCE ENGINE
 * ==========================================================
 * Computes multi-period sector returns, relative strength against benchmarks (VN-INDEX/VN30),
 * sector momentum (RSI/MACD), sector breadth, and deterministic ranking.
 *
 * REUSED CANONICAL SOURCES:
 *   - Sector classification: src/services/market/stockUniverse.ts (VIETNAM_STOCKS_UNIVERSE)
 *   - Technical Indicators: src/lib/indicators/ (sma, rsi, macd)
 */

import { VIETNAM_STOCKS_UNIVERSE } from '../../../services/market/stockUniverse.ts';
import { calculateRSI } from '../../indicators/rsi.ts';
import { calculateMACD } from '../../indicators/macd.ts';
import { calculateSMA } from '../../indicators/sma.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type {
  ConstituentCandleData,
  SectorIntelligenceResult,
  SectorMetrics,
  SectorReturns,
} from './types.ts';

export interface SectorIntelligenceOptions {
  asOf?: string;
  benchmarkCandles?: {
    vnIndex?: readonly CandlePoint[];
    vn30?: readonly CandlePoint[];
  };
}

export class SectorIntelligenceEngine {
  public static readonly VERSION = 'v1.0.0-phase20';

  /**
   * Evaluates all sectors from constituent candles and optional benchmark candles.
   */
  public static evaluate(
    constituents: readonly ConstituentCandleData[],
    options?: SectorIntelligenceOptions
  ): SectorIntelligenceResult {
    const asOf = options?.asOf || new Date().toISOString();
    const warnings: string[] = [];

    // 1. Build canonical symbol -> sector lookup
    const symbolToSector = new Map<string, { sectorId: string; sectorName: string }>();
    for (const stock of VIETNAM_STOCKS_UNIVERSE) {
      symbolToSector.set(stock.symbol.toUpperCase(), {
        sectorId: stock.sectorId || 'other',
        sectorName: stock.sector || 'Khác',
      });
    }

    // 2. Group constituent candles by sector
    const sectorConstituentsMap = new Map<
      string,
      { sectorName: string; constituents: ConstituentCandleData[] }
    >();

    // Pre-populate known sectors from universe
    for (const stock of VIETNAM_STOCKS_UNIVERSE) {
      const sId = stock.sectorId || 'other';
      if (!sectorConstituentsMap.has(sId)) {
        sectorConstituentsMap.set(sId, {
          sectorName: stock.sector || 'Khác',
          constituents: [],
        });
      }
    }

    for (const item of constituents) {
      const sym = item.symbol.toUpperCase();
      const meta = symbolToSector.get(sym);
      const sectorId = item.sectorId || meta?.sectorId || 'UNKNOWN_SECTOR';
      const sectorName = meta?.sectorName || (sectorId === 'UNKNOWN_SECTOR' ? 'Chưa phân loại' : sectorId);

      if (!sectorConstituentsMap.has(sectorId)) {
        sectorConstituentsMap.set(sectorId, { sectorName, constituents: [] });
      }
      sectorConstituentsMap.get(sectorId)!.constituents.push(item);
    }

    // 3. Compute benchmark multi-period returns
    const vnIndexReturns = this.computePeriodReturns(options?.benchmarkCandles?.vnIndex);
    const vn30Returns = this.computePeriodReturns(options?.benchmarkCandles?.vn30);

    // 4. Compute metrics for each sector
    const sectorMetricsList: SectorMetrics[] = [];

    for (const [sectorId, group] of sectorConstituentsMap.entries()) {
      const totalConstituents = group.constituents.length;
      if (totalConstituents === 0) {
        continue;
      }

      let validConstituents = 0;
      let advanceCount = 0;
      let declineCount = 0;
      let unchangedCount = 0;

      let ma20Eligible = 0;
      let ma20Above = 0;
      let ma50Eligible = 0;
      let ma50Above = 0;

      // Collect returns across valid constituents to compute equal-weighted sector returns
      const constituentReturns: {
        d1: number[];
        w1: number[];
        m1: number[];
        m3: number[];
        m6: number[];
      } = { d1: [], w1: [], m1: [], m3: [], m6: [] };

      // Collect synthetic composite price series for sector momentum
      // We build an equal-weighted daily index from the constituents
      const datesMap = new Map<string, number[]>();

      for (const item of group.constituents) {
        const candles = item.candles;
        if (!candles || candles.length === 0) continue;

        const latest = candles[candles.length - 1];
        if (typeof latest.close !== 'number' || isNaN(latest.close) || latest.close <= 0) {
          continue;
        }

        validConstituents++;

        // 1D change & advance/decline
        let d1Ret: number | null = null;
        if (candles.length >= 2) {
          const prev = candles[candles.length - 2];
          if (prev.close > 0) {
            d1Ret = ((latest.close - prev.close) / prev.close) * 100;
            if (latest.close > prev.close) advanceCount++;
            else if (latest.close < prev.close) declineCount++;
            else unchangedCount++;
          }
        } else {
          d1Ret = ((latest.close - latest.open) / latest.open) * 100;
          if (latest.close > latest.open) advanceCount++;
          else if (latest.close < latest.open) declineCount++;
          else unchangedCount++;
        }
        if (d1Ret !== null && !isNaN(d1Ret)) constituentReturns.d1.push(d1Ret);

        // 1W return (5 bars)
        if (candles.length >= 6) {
          const bar5 = candles[candles.length - 6];
          if (bar5.close > 0) {
            constituentReturns.w1.push(((latest.close - bar5.close) / bar5.close) * 100);
          }
        }

        // 1M return (21 bars)
        if (candles.length >= 22) {
          const bar21 = candles[candles.length - 22];
          if (bar21.close > 0) {
            constituentReturns.m1.push(((latest.close - bar21.close) / bar21.close) * 100);
          }
        }

        // 3M return (63 bars)
        if (candles.length >= 64) {
          const bar63 = candles[candles.length - 64];
          if (bar63.close > 0) {
            constituentReturns.m3.push(((latest.close - bar63.close) / bar63.close) * 100);
          }
        }

        // 6M return (126 bars)
        if (candles.length >= 127) {
          const bar126 = candles[candles.length - 127];
          if (bar126.close > 0) {
            constituentReturns.m6.push(((latest.close - bar126.close) / bar126.close) * 100);
          }
        }

        // MA20 & MA50 participation
        if (candles.length >= 20) {
          const sma20 = calculateSMA(candles as CandlePoint[], 20);
          if (sma20.length > 0) {
            ma20Eligible++;
            if (latest.close > sma20[sma20.length - 1].value) ma20Above++;
          }
        }
        if (candles.length >= 50) {
          const sma50 = calculateSMA(candles as CandlePoint[], 50);
          if (sma50.length > 0) {
            ma50Eligible++;
            if (latest.close > sma50[sma50.length - 1].value) ma50Above++;
          }
        }

        // Populate datesMap for synthetic sector candles
        for (const c of candles.slice(-60)) {
          const dateKey = String(c.time);
          if (!datesMap.has(dateKey)) datesMap.set(dateKey, []);
          datesMap.get(dateKey)!.push(c.close);
        }
      }

      const coverageRatio = totalConstituents > 0 ? validConstituents / totalConstituents : 0;

      // Equal-weighted sector returns
      const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      const sectorReturns: SectorReturns = {
        d1: avg(constituentReturns.d1) !== null ? Number(avg(constituentReturns.d1)!.toFixed(2)) : null,
        w1: avg(constituentReturns.w1) !== null ? Number(avg(constituentReturns.w1)!.toFixed(2)) : null,
        m1: avg(constituentReturns.m1) !== null ? Number(avg(constituentReturns.m1)!.toFixed(2)) : null,
        m3: avg(constituentReturns.m3) !== null ? Number(avg(constituentReturns.m3)!.toFixed(2)) : null,
        m6: avg(constituentReturns.m6) !== null ? Number(avg(constituentReturns.m6)!.toFixed(2)) : null,
      };

      // Relative Strength vs Benchmarks (Excess return: sector - benchmark)
      const diffReturn = (sec: number | null, bmk: number | null): number | null => {
        if (sec === null || bmk === null) return null;
        return Number((sec - bmk).toFixed(2));
      };

      const rsVsVnIndex: SectorReturns = {
        d1: diffReturn(sectorReturns.d1, vnIndexReturns.d1),
        w1: diffReturn(sectorReturns.w1, vnIndexReturns.w1),
        m1: diffReturn(sectorReturns.m1, vnIndexReturns.m1),
        m3: diffReturn(sectorReturns.m3, vnIndexReturns.m3),
        m6: diffReturn(sectorReturns.m6, vnIndexReturns.m6),
      };

      const rsVsVn30: SectorReturns = {
        d1: diffReturn(sectorReturns.d1, vn30Returns.d1),
        w1: diffReturn(sectorReturns.w1, vn30Returns.w1),
        m1: diffReturn(sectorReturns.m1, vn30Returns.m1),
        m3: diffReturn(sectorReturns.m3, vn30Returns.m3),
        m6: diffReturn(sectorReturns.m6, vn30Returns.m6),
      };

      // Sector Momentum via synthetic index
      const sortedDates = Array.from(datesMap.keys()).sort();
      const sectorCandles: CandlePoint[] = sortedDates.map((date) => {
        const prices = datesMap.get(date)!;
        const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        return {
          time: date,
          open: meanPrice,
          high: meanPrice,
          low: meanPrice,
          close: meanPrice,
          volume: 1000,
        };
      });

      let rsi14: number | null = null;
      let macdTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE' = 'UNAVAILABLE';
      let momentumScore: number | null = null;

      if (sectorCandles.length >= 20) {
        const rsiSeries = calculateRSI(sectorCandles, 14);
        if (rsiSeries.length > 0) {
          rsi14 = Number(rsiSeries[rsiSeries.length - 1].value.toFixed(1));
        }

        const macdSeries = calculateMACD(sectorCandles, 12, 26, 9);
        if (macdSeries.length > 0) {
          const latestM = macdSeries[macdSeries.length - 1];
          macdTrend = latestM.macd > latestM.signal ? 'BULLISH' : 'BEARISH';
        }

        // Normalized momentum score (0-100)
        if (rsi14 !== null) {
          const rsiFactor = Math.min(Math.max(rsi14, 0), 100);
          const macdFactor = macdTrend === 'BULLISH' ? 65 : 35;
          momentumScore = Math.round(rsiFactor * 0.6 + macdFactor * 0.4);
        }
      }

      // Sector Breadth
      const percentAboveMA20 =
        ma20Eligible > 0 ? Number((ma20Above / ma20Eligible).toFixed(4)) : null;
      const percentAboveMA50 =
        ma50Eligible > 0 ? Number((ma50Above / ma50Eligible).toFixed(4)) : null;

      // Deterministic Composite Ranking Score (0 - 100)
      // Component 1: Return Score (30%) - Normalized 1M & 3M returns
      let returnScore = 50;
      if (sectorReturns.m1 !== null) {
        returnScore = Math.min(Math.max(50 + sectorReturns.m1 * 3, 0), 100);
      }

      // Component 2: Relative Strength Score (30%) - Normalized RS vs VN-INDEX
      let rsScore = 50;
      if (rsVsVnIndex.m1 !== null) {
        rsScore = Math.min(Math.max(50 + rsVsVnIndex.m1 * 3, 0), 100);
      }

      // Component 3: Momentum Score (20%)
      const momScore = momentumScore ?? 50;

      // Component 4: Breadth Score (20%)
      let breadthScore = 50;
      if (percentAboveMA20 !== null) {
        breadthScore = Math.round(percentAboveMA20 * 100);
      }

      const compositeScore =
        validConstituents > 0
          ? Math.round(returnScore * 0.3 + rsScore * 0.3 + momScore * 0.2 + breadthScore * 0.2)
          : null;

      const sectorWarnings: string[] = [];
      if (coverageRatio < 0.5) {
        sectorWarnings.push(
          `LOW_SECTOR_COVERAGE: Valid constituents ${validConstituents}/${totalConstituents} is below 50%.`
        );
      }
      if (sectorId === 'UNKNOWN_SECTOR') {
        sectorWarnings.push('UNKNOWN_SECTOR: Contains unmapped symbols.');
      }

      sectorMetricsList.push({
        sectorId,
        sectorName: group.sectorName,
        totalConstituents,
        validConstituents,
        coverageRatio: Number(coverageRatio.toFixed(4)),
        returns: sectorReturns,
        relativeStrength: {
          vsVnIndex: rsVsVnIndex,
          vsVn30: rsVsVn30,
        },
        momentum: {
          rsi14,
          macdTrend,
          momentumScore,
        },
        breadth: {
          advanceCount,
          declineCount,
          unchangedCount,
          percentAboveMA20,
          percentAboveMA50,
        },
        compositeScore,
        rank: null, // Assigned in step 5
        warnings: sectorWarnings,
      });
    }

    // 5. Deterministic Sector Ranking (Sort by compositeScore desc, then m1 return desc, then sectorId asc)
    sectorMetricsList.sort((a, b) => {
      const scoreA = a.compositeScore ?? -1;
      const scoreB = b.compositeScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;

      const retA = a.returns.m1 ?? -999;
      const retB = b.returns.m1 ?? -999;
      if (retB !== retA) return retB - retA;

      return a.sectorId.localeCompare(b.sectorId);
    });

    sectorMetricsList.forEach((s, idx) => {
      s.rank = s.compositeScore !== null ? idx + 1 : null;
    });

    return {
      asOf,
      sectors: sectorMetricsList,
      calculationVersion: SectorIntelligenceEngine.VERSION,
      dataLineage: {
        source: 'SectorIntelligenceEngine',
        timestamp: asOf,
      },
      warnings,
    };
  }

  /**
   * Helper to compute returns across 1D, 1W, 1M, 3M, 6M from a candlestick series.
   */
  private static computePeriodReturns(candles?: readonly CandlePoint[]): SectorReturns {
    if (!candles || candles.length === 0) {
      return { d1: null, w1: null, m1: null, m3: null, m6: null };
    }

    const latest = candles[candles.length - 1];
    if (typeof latest.close !== 'number' || isNaN(latest.close) || latest.close <= 0) {
      return { d1: null, w1: null, m1: null, m3: null, m6: null };
    }

    const getReturn = (lookbackBars: number): number | null => {
      if (candles.length <= lookbackBars) return null;
      const prior = candles[candles.length - 1 - lookbackBars];
      if (prior.close <= 0) return null;
      return Number((((latest.close - prior.close) / prior.close) * 100).toFixed(2));
    };

    return {
      d1: getReturn(1),
      w1: getReturn(5),
      m1: getReturn(21),
      m3: getReturn(63),
      m6: getReturn(126),
    };
  }
}
