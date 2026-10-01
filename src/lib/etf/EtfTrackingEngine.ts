/**
 * PHASE 22 — ETF TRACKING ENGINE
 * =================================
 * Pure mathematical engine for ETF Tracking Difference (TD),
 * Tracking Error (TE), Beta, and Correlation against the underlying benchmark.
 *
 * Invariants:
 * - Minimum observation requirement (N >= 20 sessions)
 * - Sample standard deviation for daily excess returns (N - 1 denominator)
 * - Standard 252 trading day annualization factor: TE_ann = TE_daily * sqrt(252)
 * - Fails closed to DATA_UNAVAILABLE if series are incomplete or misaligned
 */

import type { EtfTrackingMetrics } from './types.ts';
import type { CandlePoint } from '../indicators/types.ts';

export interface TrackingCalculationInput {
  symbol: string;
  benchmarkSymbol: string;
  etfBars: CandlePoint[];
  benchmarkBars: CandlePoint[];
  asOfDate?: string;
  minObservations?: number;
}

export class EtfTrackingEngine {
  public static readonly MIN_OBSERVATIONS = 20;
  public static readonly ANNUALIZATION_FACTOR = Math.sqrt(252);

  /**
   * Aligns ETF and benchmark bars by date and computes daily percentage returns.
   */
  public static alignDailyReturns(
    etfBars: CandlePoint[],
    benchmarkBars: CandlePoint[]
  ): { etfReturns: number[]; benchReturns: number[]; dates: string[] } {
    const benchMap = new Map<string, number>();
    for (const b of benchmarkBars) {
      if (b.close !== null && b.close > 0 && b.time !== undefined && b.time !== null) {
        benchMap.set(String(b.time), b.close);
      }
    }

    const commonPoints: { time: string; etfClose: number; benchClose: number }[] = [];
    for (const e of etfBars) {
      const eTime = String(e.time ?? '');
      if (e.close !== null && e.close > 0 && eTime && benchMap.has(eTime)) {
        commonPoints.push({
          time: eTime,
          etfClose: e.close,
          benchClose: benchMap.get(eTime)!,
        });
      }
    }

    // Sort chronologically
    commonPoints.sort((a, b) => a.time.localeCompare(b.time));

    const etfReturns: number[] = [];
    const benchReturns: number[] = [];
    const dates: string[] = [];

    for (let i = 1; i < commonPoints.length; i++) {
      const prev = commonPoints[i - 1];
      const curr = commonPoints[i];

      const rEtf = (curr.etfClose - prev.etfClose) / prev.etfClose;
      const rBench = (curr.benchClose - prev.benchClose) / prev.benchClose;

      if (Number.isFinite(rEtf) && Number.isFinite(rBench)) {
        etfReturns.push(rEtf);
        benchReturns.push(rBench);
        dates.push(curr.time);
      }
    }

    return { etfReturns, benchReturns, dates };
  }

  /**
   * Analyzes tracking performance between ETF and its benchmark.
   */
  public static analyze(input: TrackingCalculationInput): EtfTrackingMetrics {
    const {
      symbol,
      benchmarkSymbol,
      etfBars,
      benchmarkBars,
      asOfDate = new Date().toISOString().slice(0, 10),
      minObservations = this.MIN_OBSERVATIONS,
    } = input;

    const warnings: string[] = [];

    const { etfReturns, benchReturns } = this.alignDailyReturns(etfBars, benchmarkBars);
    const n = etfReturns.length;

    if (n < minObservations) {
      warnings.push(`Insufficient aligned trading days: ${n} < ${minObservations}`);
      return {
        symbol,
        benchmark: benchmarkSymbol,
        observationCount: n,
        trackingDifference: null,
        trackingErrorDaily: null,
        trackingErrorAnnualized: null,
        beta: null,
        correlation: null,
        rSquared: null,
        asOfDate,
        status: 'DATA_UNAVAILABLE',
        warnings,
      };
    }

    // 1. Tracking Difference (Cumulative Return Spread)
    // Compute cumulative return from geometric compounding
    let cumEtf = 1;
    let cumBench = 1;
    for (let i = 0; i < n; i++) {
      cumEtf *= 1 + etfReturns[i];
      cumBench *= 1 + benchReturns[i];
    }
    const etfCumReturnPct = (cumEtf - 1) * 100;
    const benchCumReturnPct = (cumBench - 1) * 100;
    const trackingDifference = Math.round((etfCumReturnPct - benchCumReturnPct) * 100) / 100;

    // 2. Excess Daily Returns & Tracking Error
    const excessReturns: number[] = [];
    for (let i = 0; i < n; i++) {
      excessReturns.push((etfReturns[i] - benchReturns[i]) * 100);
    }

    const meanExcess = excessReturns.reduce((acc, v) => acc + v, 0) / n;
    let sumSquaredDiff = 0;
    for (let i = 0; i < n; i++) {
      sumSquaredDiff += Math.pow(excessReturns[i] - meanExcess, 2);
    }
    const sampleVariance = sumSquaredDiff / (n - 1);
    const trackingErrorDaily = Math.round(Math.sqrt(sampleVariance) * 1000) / 1000;
    const trackingErrorAnnualized =
      Math.round(trackingErrorDaily * this.ANNUALIZATION_FACTOR * 100) / 100;

    // 3. Beta, Correlation & R-squared
    const meanEtf = etfReturns.reduce((acc, v) => acc + v, 0) / n;
    const meanBench = benchReturns.reduce((acc, v) => acc + v, 0) / n;

    let cov = 0;
    let varBench = 0;
    let varEtf = 0;

    for (let i = 0; i < n; i++) {
      const diffEtf = etfReturns[i] - meanEtf;
      const diffBench = benchReturns[i] - meanBench;

      cov += diffEtf * diffBench;
      varBench += diffBench * diffBench;
      varEtf += diffEtf * diffEtf;
    }

    let beta: number | null = null;
    let correlation: number | null = null;
    let rSquared: number | null = null;

    if (varBench > 0) {
      beta = Math.round((cov / varBench) * 1000) / 1000;
    }

    if (varBench > 0 && varEtf > 0) {
      correlation = Math.round((cov / Math.sqrt(varBench * varEtf)) * 1000) / 1000;
      rSquared = Math.round(Math.pow(correlation, 2) * 1000) / 1000;
    }

    return {
      symbol,
      benchmark: benchmarkSymbol,
      observationCount: n,
      trackingDifference,
      trackingErrorDaily,
      trackingErrorAnnualized,
      beta,
      correlation,
      rSquared,
      asOfDate,
      status: 'COMPUTED',
      warnings,
    };
  }
}
