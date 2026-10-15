/**
 * Fundamentals page presentation helpers.
 *
 * Pure and deterministic. The one hard rule inherited from the VPS provider:
 * `periodMetadata.mappingStatus === 'AMBIGUOUS'` — slot V1..V4 are NOT a
 * confirmed time axis, so nothing here may label a slot "current year" or
 * present a slot-to-slot delta as a certified YoY growth rate. Labels are the
 * verbatim source labels, and every derived figure is explicitly marked as
 * derived.
 */

import type {
  VpsFinancialSeries,
  VpsNormalizedFundamentals,
  VpsPeriodLabel,
} from '../../services/market/providers/vps/types';

export type SeriesKey = keyof VpsFinancialSeries;

export const SERIES_KEYS: readonly SeriesKey[] = [
  'netRevenue',
  'grossProfit',
  'operatingProfit',
  'netProfit',
  'totalAssets',
  'liabilities',
  'equity',
  'eps',
  'bvps',
  'pe',
  'ros',
  'roe',
  'roa',
];

export const SERIES_LABELS: Readonly<Record<SeriesKey, string>> = {
  netRevenue: 'Doanh thu thuần',
  grossProfit: 'Lợi nhuận gộp',
  operatingProfit: 'Lợi nhuận hoạt động',
  netProfit: 'Lợi nhuận sau thuế',
  totalAssets: 'Tổng tài sản',
  liabilities: 'Tổng nợ phải trả',
  equity: 'Vốn chủ sở hữu',
  eps: 'EPS',
  bvps: 'BVPS',
  pe: 'P/E',
  ros: 'ROS (%)',
  roe: 'ROE (%)',
  roa: 'ROA (%)',
};

export interface SlotRow {
  readonly slot: string;
  readonly sourceLabel: string | null;
  readonly periodEnd: string | null;
  readonly values: Readonly<Record<SeriesKey, number | null>>;
}

function at(values: readonly (number | null)[] | undefined, index: number): number | null {
  const v = values?.[index];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function buildSlotRows(
  series: VpsFinancialSeries,
  periods: readonly VpsPeriodLabel[]
): SlotRow[] {
  const length = Math.max(
    periods.length,
    ...SERIES_KEYS.map((key) => series[key]?.length ?? 0),
    0
  );
  const rows: SlotRow[] = [];
  for (let i = 0; i < length; i++) {
    const values = {} as Record<SeriesKey, number | null>;
    for (const key of SERIES_KEYS) values[key] = at(series[key], i);
    const period = periods[i];
    rows.push({
      slot: period?.slot ?? `V${i + 1}`,
      sourceLabel: period?.sourceLabel ?? null,
      periodEnd: period?.periodEnd ?? null,
      values,
    });
  }
  return rows;
}

/** First finite value in the series — used for valuation inputs only. */
export function firstFinite(values: readonly (number | null)[] | undefined): number | null {
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Relative change between two slot values in %.
 * Returns null unless BOTH values exist — a missing operand is never a 0%.
 */
export function slotDeltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Formats a MILLION-VND statement value as "X tỷ đồng". */
export function millionVndToText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / 1000)} tỷ`;
}

export interface DerivedValuation {
  readonly pe: number | null;
  readonly pb: number | null;
  readonly earningsYieldPct: number | null;
  readonly bookToPricePct: number | null;
}

/**
 * Valuation derived from REAL price (VPS quote) and REAL per-share figures
 * (VPS statements). Any missing operand yields null — never a fabricated
 * multiple.
 */
export function deriveValuation(
  lastPrice: number | null,
  eps: number | null,
  bvps: number | null
): DerivedValuation {
  const pe = lastPrice !== null && eps !== null && eps > 0 ? lastPrice / eps : null;
  const pb = lastPrice !== null && bvps !== null && bvps > 0 ? lastPrice / bvps : null;
  return {
    pe,
    pb,
    earningsYieldPct: pe !== null && pe !== 0 ? (1 / pe) * 100 : null,
    bookToPricePct: pb !== null && pb !== 0 ? (1 / pb) * 100 : null,
  };
}

/** Max absolute magnitude across a set of numbers — used to scale bar widths. */
export function maxMagnitude(values: readonly (number | null)[]): number {
  let max = 0;
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
  }
  return max > 0 ? max : 1;
}
