/**
 * DATA-01 — HISTORICAL BARS + COVERAGE ENGINES
 * ============================================
 * Canonical DAILY bars (extensible to INTRADAY/WEEKLY/MONTHLY).
 * Pure + deterministic. No provider calls, no clock.
 *
 * Validation mirrors MarketDataIntegrityGuard/BacktestDataAdapter semantics:
 * open/high/low/close finite > 0, high >= max(open,close), low <= min(open,close),
 * volume >= 0. Invalid rows are reported, never silently repaired.
 */

import type { CanonicalBar, CoverageReport } from './types.ts';

export interface ValidateBarResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class HistoricalBarsEngine {
  static validateBar(bar: CanonicalBar): ValidateBarResult {
    const reasons: string[] = [];
    if (!DATE_RE.test(bar.date)) reasons.push('INVALID_DATE');
    for (const k of ['open', 'high', 'low', 'close'] as const) {
      const v = bar[k];
      if (!Number.isFinite(v) || v <= 0) reasons.push(`INVALID_${k.toUpperCase()}`);
    }
    if (
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.close)
    ) {
      if (bar.high < Math.max(bar.open, bar.close)) reasons.push('HIGH_BELOW_BODY');
      if (bar.low > Math.min(bar.open, bar.close)) reasons.push('LOW_ABOVE_BODY');
      if (bar.high < bar.low) reasons.push('HIGH_BELOW_LOW');
    }
    if (!Number.isFinite(bar.volume) || bar.volume < 0) reasons.push('INVALID_VOLUME');
    if (!Number.isFinite(bar.value) || bar.value < 0) reasons.push('INVALID_VALUE');
    return { valid: reasons.length === 0, reasons };
  }

  static normalize(bars: readonly CanonicalBar[]): {
    readonly clean: readonly CanonicalBar[];
    readonly duplicates: readonly string[];
    readonly invalid: readonly { readonly bar: CanonicalBar; readonly reasons: readonly string[] }[];
  } {
    const seen = new Set<string>();
    const clean: CanonicalBar[] = [];
    const duplicates: string[] = [];
    const invalid: { readonly bar: CanonicalBar; readonly reasons: readonly string[] }[] = [];
    const sorted = [...bars].sort((a, b) =>
      a.date === b.date ? 0 : a.date < b.date ? -1 : 1
    );
    for (const bar of sorted) {
      const key = `${bar.instrumentId}|${bar.date}`;
      if (seen.has(key)) {
        duplicates.push(bar.date);
        continue;
      }
      seen.add(key);
      const v = HistoricalBarsEngine.validateBar(bar);
      if (!v.valid) {
        invalid.push({ bar, reasons: v.reasons });
        continue;
      }
      clean.push(bar);
    }
    return { clean, duplicates, invalid };
  }

  static query(
    bars: readonly CanonicalBar[],
    opts: {
      readonly instrumentId: string;
      readonly from: string;
      readonly to: string;
      readonly dataVersion?: string;
    }
  ): readonly CanonicalBar[] {
    return bars
      .filter(
        (b) =>
          b.instrumentId === opts.instrumentId && b.date >= opts.from && b.date <= opts.to
      )
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export class CoverageEngine {
  static analyze(
    instrumentId: string,
    bars: readonly CanonicalBar[],
    opts?: { readonly volumeSpikeMultiple?: number }
  ): CoverageReport {
    const mine = HistoricalBarsEngine.query(bars, {
      instrumentId,
      from: '0000-01-01',
      to: '9999-12-31',
    });
    if (mine.length === 0) {
      return {
        instrumentId,
        firstObservation: null,
        lastObservation: null,
        barCount: 0,
        missingPeriods: [],
        duplicatePeriods: [],
        gapCount: 0,
        invalidOhlcCount: 0,
        zeroOrNegativePriceCount: 0,
        volumeAnomalyCount: 0,
      };
    }
    const dates = mine.map((b) => b.date);
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    for (const d of dates) {
      const c = (seen.get(d) ?? 0) + 1;
      seen.set(d, c);
      if (c === 2) duplicates.push(d);
    }
    const first = dates[0];
    const last = dates[dates.length - 1];
    const present = new Set(dates);
    const missing: string[] = [];
    let cursor = first;
    while (cursor <= last) {
      const day = new Date(cursor + 'T00:00:00Z').getUTCDay();
      if (day !== 0 && day !== 6 && !present.has(cursor)) missing.push(cursor);
      if (cursor === last) break;
      cursor = addDays(cursor, 1);
    }
    let invalidOhlc = 0;
    let zeroNeg = 0;
    for (const b of mine) {
      const v = HistoricalBarsEngine.validateBar(b);
      if (!v.valid) {
        invalidOhlc += 1;
        if (
          v.reasons.some(
            (r) => r === 'INVALID_OPEN' || r === 'INVALID_HIGH' || r === 'INVALID_LOW' || r === 'INVALID_CLOSE'
          )
        ) {
          zeroNeg += 1;
        }
      }
    }
    const volumes = mine.map((b) => b.volume);
    const mean = volumes.reduce((a, v) => a + v, 0) / Math.max(1, volumes.length);
    const multiple = opts?.volumeSpikeMultiple ?? 10;
    const volumeAnomalyCount = volumes.filter((v) => mean > 0 && v > mean * multiple).length;
    return {
      instrumentId,
      firstObservation: first,
      lastObservation: last,
      barCount: mine.length,
      missingPeriods: missing,
      duplicatePeriods: duplicates,
      gapCount: missing.length,
      invalidOhlcCount: invalidOhlc,
      zeroOrNegativePriceCount: zeroNeg,
      volumeAnomalyCount,
    };
  }
}
