import { describe, it, expect } from 'vitest';
import {
  SERIES_KEYS,
  SERIES_LABELS,
  buildSlotRows,
  deriveValuation,
  firstFinite,
  maxMagnitude,
  millionVndToText,
  slotDeltaPct,
} from '../metrics';
import type {
  VpsFinancialSeries,
  VpsPeriodLabel,
} from '../../../services/market/providers/vps/types';

function makeSeries(fill: number): VpsFinancialSeries {
  const series = {} as Record<(typeof SERIES_KEYS)[number], (number | null)[]>;
  for (const key of SERIES_KEYS) series[key] = [fill, fill * 2, null, fill];
  return series as unknown as VpsFinancialSeries;
}

const PERIODS: VpsPeriodLabel[] = [
  { slot: 'V1', sourceLabel: 'Năm 2020', termCode: 'A', yearPeriod: 2020, periodEnd: '202012' },
  { slot: 'V2', sourceLabel: 'Năm 2019', termCode: 'A', yearPeriod: 2019, periodEnd: '201912' },
  { slot: 'V3', sourceLabel: null, termCode: null, yearPeriod: null, periodEnd: null },
  { slot: 'V4', sourceLabel: 'Năm 2017', termCode: 'A', yearPeriod: 2017, periodEnd: '201712' },
];

describe('fundamentals/metrics — slot rows', () => {
  it('labels every series with a Vietnamese name', () => {
    for (const key of SERIES_KEYS) {
      expect(SERIES_LABELS[key]).toBeTruthy();
    }
    expect(SERIES_KEYS).toHaveLength(Object.keys(SERIES_LABELS).length);
  });

  it('keeps the source label verbatim and falls back to the slot id', () => {
    const rows = buildSlotRows(makeSeries(10), PERIODS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ slot: 'V1', sourceLabel: 'Năm 2020', periodEnd: '202012' });
    expect(rows[2].sourceLabel).toBeNull();
    expect(rows[2].periodEnd).toBeNull();
  });

  it('preserves null rather than coercing a missing value to 0', () => {
    const rows = buildSlotRows(makeSeries(10), PERIODS);
    expect(rows[2].values.netRevenue).toBeNull();
    expect(rows[2].values.eps).toBeNull();
    expect(rows[1].values.netRevenue).toBe(20);
  });

  it('pads rows when the period axis is shorter than the value axis', () => {
    const rows = buildSlotRows(makeSeries(5), []);
    expect(rows).toHaveLength(4);
    expect(rows[0].slot).toBe('V1');
    expect(rows[0].sourceLabel).toBeNull();
  });
});

describe('fundamentals/metrics — numeric guards', () => {
  it('firstFinite skips null and NaN', () => {
    expect(firstFinite([null, NaN, 7, 9])).toBe(7);
    expect(firstFinite([null, undefined as unknown as number])).toBeNull();
    expect(firstFinite(undefined)).toBeNull();
  });

  it('slotDeltaPct returns null for a missing or zero previous value', () => {
    expect(slotDeltaPct(120, 100)).toBe(20);
    expect(slotDeltaPct(120, null)).toBeNull();
    expect(slotDeltaPct(null, 100)).toBeNull();
    expect(slotDeltaPct(120, 0)).toBeNull();
    expect(slotDeltaPct(120, NaN)).toBeNull();
  });

  it('treats a negative denominator as magnitude, not as a direction flip', () => {
    expect(slotDeltaPct(-120, -100)).toBeCloseTo(-20, 5);
  });

  it('converts million-VND statement values to "tỷ đồng"', () => {
    expect(millionVndToText(90_118_503)).toContain('tỷ');
    expect(millionVndToText(null)).toBe('--');
    expect(millionVndToText(NaN)).toBe('--');
  });

  it('maxMagnitude never returns 0 (no division by zero)', () => {
    expect(maxMagnitude([])).toBe(1);
    expect(maxMagnitude([null, NaN])).toBe(1);
    expect(maxMagnitude([-1500, 300])).toBe(1500);
  });
});

describe('fundamentals/metrics — derived valuation', () => {
  it('derives P/E, P/B and inverted yields from a real price', () => {
    const v = deriveValuation(25_000, 2_000, 12_500);
    expect(v.pe).toBeCloseTo(12.5, 5);
    expect(v.pb).toBeCloseTo(2, 5);
    expect(v.earningsYieldPct).toBeCloseTo(8, 5);
    expect(v.bookToPricePct).toBeCloseTo(50, 5);
  });

  it('returns null multiples when any operand is missing or non-positive', () => {
    expect(deriveValuation(null, 2_000, 12_500)).toMatchObject({
      pe: null,
      pb: null,
      earningsYieldPct: null,
      bookToPricePct: null,
    });
    expect(deriveValuation(25_000, 0, -1)).toMatchObject({ pe: null, pb: null });
    expect(deriveValuation(25_000, null, null)).toMatchObject({ pe: null, pb: null });
  });
});
