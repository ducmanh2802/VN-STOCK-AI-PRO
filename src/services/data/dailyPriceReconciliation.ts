/**
 * LEGACY stock_daily -> CANONICAL RECONCILIATION (read-only)
 * ==========================================================
 * `stock_daily` may only be retired once every legacy row is represented, with the same
 * values, in the authoritative canonical series. This compares the two and says
 * whether that is true. It writes nothing.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { stockDaily, stocks } from '../../db/schema.ts';
import { CanonicalMarketDataRepository } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import { AUTHORITATIVE_DAILY_SERIES, instrumentIdFor, supportedExchangeOf } from './kbsDailyObservations.ts';

export interface DailyPriceReconciliation {
  readonly legacyRows: number;
  readonly matched: number;
  readonly missingInCanonical: number;
  readonly valueMismatches: number;
  /** Legacy symbols outside the supported universe (no canonical identity). */
  readonly unsupportedSymbols: readonly string[];
  readonly samples: readonly { symbol: string; date: string; issue: string }[];
  /** True only when every legacy row is matched exactly. */
  readonly safeToRetireLegacyTable: boolean;
}

const MAX_SAMPLES = 20;
const FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;

export async function reconcileLegacyDailyPrices(asOf: Date): Promise<DailyPriceReconciliation> {
  const legacy = await db
    .select({
      symbol: stocks.symbol,
      date: stockDaily.date,
      open: stockDaily.open,
      high: stockDaily.high,
      low: stockDaily.low,
      close: stockDaily.close,
      volume: stockDaily.volume,
    })
    .from(stockDaily)
    .innerJoin(stocks, and(eq(stockDaily.stockId, stocks.id)));

  const bySymbol = new Map<string, typeof legacy>();
  for (const row of legacy) bySymbol.set(row.symbol, [...(bySymbol.get(row.symbol) ?? []), row]);

  let matched = 0;
  let missing = 0;
  let mismatched = 0;
  const unsupported: string[] = [];
  const samples: { symbol: string; date: string; issue: string }[] = [];
  const sample = (s: { symbol: string; date: string; issue: string }) => {
    if (samples.length < MAX_SAMPLES) samples.push(s);
  };

  for (const [symbol, rows] of bySymbol) {
    const exchange = supportedExchangeOf(symbol);
    if (!exchange) {
      unsupported.push(symbol);
      missing += rows.length;
      continue;
    }
    const dates = rows.map((r) => r.date).sort();
    const canonical = await CanonicalMarketDataRepository.getDailySeries({
      instrumentId: instrumentIdFor(symbol, exchange),
      series: AUTHORITATIVE_DAILY_SERIES,
      asOf,
      from: dates[0],
      to: dates[dates.length - 1],
      limit: rows.length + 1_000,
    });
    const byDate = new Map(canonical.map((b) => [b.tradingDate, b]));
    for (const row of rows) {
      const bar = byDate.get(row.date);
      if (!bar) {
        missing += 1;
        sample({ symbol, date: row.date, issue: 'missing in canonical series' });
        continue;
      }
      const differing = FIELDS.filter((f) => {
        const legacyValue = Number(row[f]);
        const canonicalValue = bar[f];
        return canonicalValue === null || Math.abs(legacyValue - canonicalValue) > 0.005;
      });
      if (differing.length > 0) {
        mismatched += 1;
        sample({ symbol, date: row.date, issue: `differs in ${differing.join(', ')}` });
      } else {
        matched += 1;
      }
    }
  }

  return {
    legacyRows: legacy.length,
    matched,
    missingInCanonical: missing,
    valueMismatches: mismatched,
    unsupportedSymbols: unsupported,
    samples,
    safeToRetireLegacyTable: missing === 0 && mismatched === 0 && unsupported.length === 0,
  };
}
