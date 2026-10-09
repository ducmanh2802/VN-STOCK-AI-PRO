/**
 * Backtest page presentation helpers.
 *
 * Pure functions only — no clock reads (the caller injects "today"), no fetch,
 * no DOM. Kept separate from the page so the curve/cost derivation is unit
 * testable without rendering React.
 */

import type { BacktestResult, EquityPoint } from '../../lib/trading/backtest/BacktestTypes.ts';
import type { CurvePoint } from '../../components/charts/EquityCurveChart.tsx';

export type RangePreset = '1Y' | '2Y' | '3Y' | '5Y';

export const RANGE_PRESETS: readonly RangePreset[] = ['1Y', '2Y', '3Y', '5Y'];

const PRESET_DAYS: Readonly<Record<RangePreset, number>> = {
  '1Y': 365,
  '2Y': 730,
  '3Y': 1095,
  '5Y': 1826,
};

export function presetDays(preset: RangePreset): number {
  return PRESET_DAYS[preset];
}

export function isoDaysBefore(isoDate: string, days: number): string {
  const base = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base)) return isoDate;
  return new Date(base - days * 86_400_000).toISOString().slice(0, 10);
}

export function resolveDateRange(
  preset: RangePreset,
  todayIso: string
): { startDate: string; endDate: string } {
  return { startDate: isoDaysBefore(todayIso, presetDays(preset)), endDate: todayIso };
}

/** Downsamples an equity curve so the SVG stays readable on long windows. */
export function equityCurvePoints(
  curve: readonly EquityPoint[],
  maxPoints = 400
): CurvePoint[] {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const step = Math.max(1, Math.ceil(curve.length / maxPoints));
  const sampled: CurvePoint[] = [];
  for (let i = 0; i < curve.length; i += step) {
    const point = curve[i];
    sampled.push({ label: String(point.timestamp).slice(0, 10), value: point.equity });
  }
  const last = curve[curve.length - 1];
  const lastPoint = { label: String(last.timestamp).slice(0, 10), value: last.equity };
  const tail = sampled[sampled.length - 1];
  if (!tail || tail.label !== lastPoint.label) sampled.push(lastPoint);
  return sampled;
}

export function drawdownCurvePoints(
  curve: readonly EquityPoint[],
  maxPoints = 400
): CurvePoint[] {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const step = Math.max(1, Math.ceil(curve.length / maxPoints));
  const sampled: CurvePoint[] = [];
  for (let i = 0; i < curve.length; i += step) {
    const point = curve[i];
    sampled.push({ label: String(point.timestamp).slice(0, 10), value: point.drawdown });
  }
  return sampled;
}

export interface CostRow {
  readonly key: string;
  readonly label: string;
  readonly valueVnd: number;
  readonly shareOfCosts: number | null;
}

/** Absolute cost composition. `shareOfCosts` is null while total costs are 0. */
export function costRows(result: BacktestResult): CostRow[] {
  const total = (result.fees ?? 0) + (result.tax ?? 0) + (result.slippageCost ?? 0);
  const share = (v: number): number | null => (total > 0 ? (v / total) * 100 : null);
  return [
    { key: 'fees', label: 'Phí môi giới (0.15% mua / 0.15% bán)', valueVnd: result.fees ?? 0, shareOfCosts: share(result.fees ?? 0) },
    { key: 'tax', label: 'Thuế bán (0.10%)', valueVnd: result.tax ?? 0, shareOfCosts: share(result.tax ?? 0) },
    { key: 'slippage', label: 'Trượt giá (0.10%)', valueVnd: result.slippageCost ?? 0, shareOfCosts: share(result.slippageCost ?? 0) },
    { key: 'total', label: 'Tổng chi phí thực hiện', valueVnd: total, shareOfCosts: total > 0 ? 100 : null },
  ];
}

/**
 * The API router caps `tradeHistory` at 300 rows for payload size and adds
 * provenance fields saying whether it did. The page renders both.
 */
export interface SerializedBacktestResult extends BacktestResult {
  readonly tradeHistoryTruncated?: boolean;
  readonly totalTradeCount?: number;
}

export interface BacktestApiEnvelope {
  readonly success?: boolean;
  readonly dataStatus?: string;
  readonly dataSource?: string;
  readonly provenance?: {
    readonly symbol: string;
    readonly strategy: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly requestedBars: number;
    readonly firstBar: string;
    readonly lastBar: string;
    readonly engine: string;
    readonly antiLookahead: string;
    readonly boardLot: number;
  };
  readonly result?: SerializedBacktestResult;
  readonly retrievedAt?: string;
  readonly error?: { readonly code?: string; readonly message?: string };
}
