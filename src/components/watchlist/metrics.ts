import { StockSummary } from '../../types/stock';
import { SortColumn, SortDirection, SignalFilter, WatchlistStats } from './types';

/**
 * PHASE 19.5.2 — Watchlist fail-closed metric helpers.
 *
 * Core invariant: VALID data → displayed/used; INVALID or UNAVAILABLE data →
 * unavailable representation. Invalid inputs are never coerced into a finite
 * fabricated numeric value (no `|| 0`, no `?? 0`, no `Number(...)`).
 */

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Upside to fair value, in percent. Requires finite price > 0 (no division
 * by zero) and finite fairValue > 0 (a zero fair value is not a real
 * valuation — it is the missing-quote default upstream). Any invalid input
 * yields null (UNAVAILABLE) — never 0 or -100, which would fabricate a
 * neutral or strong-sell signal.
 */
export function computeUpsidePercent(price: unknown, fairValue: unknown): number | null {
  if (
    !isFiniteNumber(price) ||
    !isFiniteNumber(fairValue) ||
    price <= 0 ||
    fairValue <= 0
  ) {
    return null;
  }
  return ((fairValue - price) / price) * 100;
}

/**
 * Single authoritative implementation of the Watchlist KPI aggregation.
 *
 * Non-finite inputs are skipped (they contribute to neither sums nor
 * averages), so one poisoned row can never turn an average into NaN.
 * An average with zero valid samples is null (UNAVAILABLE) — not 0.
 * Breadth buckets only classify finite change values; a non-finite change is
 * counted as neither advance, decline, nor unchanged.
 * topGainer/topLoser only consider finite changePercent candidates.
 */
export function computeWatchlistStats(stocks: StockSummary[]): WatchlistStats {
  if (stocks.length === 0) {
    return {
      totalCount: 0,
      advances: 0,
      declines: 0,
      unchanged: 0,
      ceilings: 0,
      floors: 0,
      avgChangePercent: 0,
      avgAiScore: 0,
      avgUpsidePercent: 0,
      totalTradingValue: 0,
      totalVolume: 0,
      topGainer: null,
      topLoser: null,
    };
  }

  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let ceilings = 0;
  let floors = 0;
  let sumChange = 0;
  let changeCount = 0;
  let sumAi = 0;
  let aiCount = 0;
  let sumUpside = 0;
  let upsideCount = 0;
  let totalVal = 0;
  let totalVol = 0;

  let topGainer: StockSummary | null = null;
  let topGainerChange: number | null = null;
  let topLoser: StockSummary | null = null;
  let topLoserChange: number | null = null;

  stocks.forEach((s) => {
    if (isFiniteNumber(s.change)) {
      if (s.change > 0) advances++;
      else if (s.change < 0) declines++;
      else unchanged++;
    }

    // Ceiling/floor classification requires a real (>0) price; price 0 is the
    // upstream missing-quote mapping and must never read as "at floor".
    if (isFiniteNumber(s.price) && s.price > 0 && s.ceilingPrice > 0 && s.price >= s.ceilingPrice) ceilings++;
    if (isFiniteNumber(s.price) && s.price > 0 && s.floorPrice > 0 && s.price <= s.floorPrice) floors++;

    if (isFiniteNumber(s.changePercent)) {
      sumChange += s.changePercent;
      changeCount++;
      if (topGainerChange === null || s.changePercent > topGainerChange) {
        topGainer = s;
        topGainerChange = s.changePercent;
      }
      if (topLoserChange === null || s.changePercent < topLoserChange) {
        topLoser = s;
        topLoserChange = s.changePercent;
      }
    }

    if (isFiniteNumber(s.aiScore)) {
      sumAi += s.aiScore;
      aiCount++;
    }

    const upside = computeUpsidePercent(s.price, s.fairValue);
    if (upside !== null) {
      sumUpside += upside;
      upsideCount++;
    }

    if (isFiniteNumber(s.tradingValue)) totalVal += s.tradingValue;
    if (isFiniteNumber(s.volume)) totalVol += s.volume;
  });

  return {
    totalCount: stocks.length,
    advances,
    declines,
    unchanged,
    ceilings,
    floors,
    avgChangePercent: changeCount > 0 ? Number((sumChange / changeCount).toFixed(2)) : null,
    avgAiScore: aiCount > 0 ? Number((sumAi / aiCount).toFixed(1)) : null,
    avgUpsidePercent: upsideCount > 0 ? Number((sumUpside / upsideCount).toFixed(1)) : null,
    totalTradingValue: Number(totalVal.toFixed(1)),
    totalVolume: totalVol,
    topGainer,
    topLoser,
  };
}

/**
 * Single authoritative implementation of the AI signal filter.
 *
 * An unavailable AI score can never itself satisfy an arm of the filter; the
 * trend arms remain available because trend is an independent authoritative
 * metric. NEUTRAL requires a finite score strictly between the Bullish and
 * Bearish thresholds — unavailable scores are not "neutral" data.
 */
export function matchesSignalFilter(stock: StockSummary, filter: SignalFilter): boolean {
  if (filter === 'ALL') return true;
  const ai = stock.aiScore;
  const validAi = isFiniteNumber(ai);
  const isUp = stock.trend === 'UPTREND';
  const isDown = stock.trend === 'DOWNTREND';

  switch (filter) {
    case 'BULLISH':
      return (validAi && ai >= 60) || isUp;
    case 'BEARISH':
      return (validAi && ai <= 40) || isDown;
    case 'NEUTRAL':
      return validAi && ai > 40 && ai < 60;
    default:
      return true;
  }
}

/**
 * Single authoritative implementation of Watchlist sorting.
 *
 * Finite numeric keys sort numerically with the requested direction;
 * unavailable keys (null/undefined/NaN/non-numeric, including a null upside)
 * order AFTER all valid values regardless of direction instead of being
 * coerced to 0. Ties return 0 so the comparator stays consistent. Textual
 * (symbol) and enum-ranked (trend) keys keep their existing behavior.
 */
export function makeWatchlistSorter(sortColumn: SortColumn, sortDirection: SortDirection) {
  return (a: StockSummary, b: StockSummary): number => {
    if (sortColumn === 'symbol') {
      return sortDirection === 'asc'
        ? a.symbol.localeCompare(b.symbol)
        : b.symbol.localeCompare(a.symbol);
    }

    if (sortColumn === 'trend') {
      const rank = (s: StockSummary) => (s.trend === 'UPTREND' ? 3 : s.trend === 'SIDEWAY' ? 2 : 1);
      return sortDirection === 'asc' ? rank(a) - rank(b) : rank(b) - rank(a);
    }

    const rawOf = (s: StockSummary): unknown => {
      switch (sortColumn) {
        case 'price':
          return s.price;
        case 'changePercent':
          return s.changePercent;
        case 'volume':
          return s.volume;
        case 'tradingValue':
          return s.tradingValue;
        case 'rsi':
          return s.rsi;
        case 'pe':
          return s.pe;
        case 'roe':
          return s.roe;
        case 'fairValue':
          return s.fairValue;
        case 'aiScore':
        case 'signal':
          return s.aiScore;
        case 'upside':
          return computeUpsidePercent(s.price, s.fairValue);
        default:
          return undefined;
      }
    };

    const rawA = rawOf(a);
    const rawB = rawOf(b);
    const valA = isFiniteNumber(rawA) ? rawA : null;
    const valB = isFiniteNumber(rawB) ? rawB : null;

    if (valA !== null && valB !== null) {
      if (valA === valB) return 0;
      return sortDirection === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    }
    if (valA !== null || valB !== null) {
      return valA !== null ? -1 : 1; // Valid metrics first; unavailable last in both directions
    }
    return 0;
  };
}
