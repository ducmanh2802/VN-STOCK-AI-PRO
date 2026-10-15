/**
 * PHASE 19.5.6 — Portfolio / Positions page-local presentation helpers.
 *
 * Fail-closed contract (docs/metric-contracts.md §1):
 * - `null` / `undefined` / `NaN` / `±Infinity` mean DATA UNAVAILABLE and render
 *   as an explicit dash ('—') — NEVER as a fabricated `0`.
 * - `0` is a valid financial value and must always render as `0`.
 * - This module performs PRESENTATION-ONLY formatting (unit scaling to millions,
 *   sign prefixes, locale grouping). No financial recomputation of canonical
 *   trading-state values (BrokerAccount / BrokerPosition) happens here or in
 *   the Portfolio UI.
 */
import { formatNumber, formatPercent } from '../../utils/formatters';

export const UNAVAILABLE = '—';

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Presentation-only: renders a canonical VND amount in millions ("1.23 tr"). Fail-closed. */
export function formatMillionsVND(value: unknown): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  return `${(value / 1_000_000).toFixed(2)} tr`;
}

/** Presentation-only: signed millions variant ("+1.23 tr" / "-1.23 tr" / "0.00 tr"). Fail-closed. */
export function formatSignedMillionsVND(value: unknown): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  return `${value > 0 ? '+' : ''}${formatMillionsVND(value)}`;
}

/** Presentation-only: signed percent ("+9.65%" / "0.00%"). Fail-closed. */
export function formatSignedPercent(value: unknown): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  return formatPercent(value);
}

/** Presentation-only: canonical share/price amount ("31.250"). Fail-closed. */
export function formatAmount(value: unknown): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE;
  return formatNumber(value);
}