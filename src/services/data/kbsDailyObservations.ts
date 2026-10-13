/**
 * KBS DAILY BARS -> CANONICAL OBSERVATIONS
 * ========================================
 * The one mapping from the KBS `data_day` feed onto canonical daily observations,
 * shared by the on-demand ingest route and the scheduled end-of-day job so both write
 * the same series (same instrument ids, bar instants, source record ids and version).
 *
 * Only FINAL sessions are returned. A bar for a session that has not finished yet is an
 * in-progress snapshot; storing it under the append-only canonical key would freeze
 * intraday values as the day's bar, so it is withheld and counted instead.
 */
import { KbsHistoricalProvider } from '../market/providers/kbs/KbsHistoricalProvider.ts';
import { VIETNAM_STOCKS_UNIVERSE } from '../market/stockUniverse.ts';
import { asVnExchange, type VnExchange } from '../../lib/data/vnPriceLimits.ts';
import { lastFinalizedSession } from '../../lib/data/vnTradingCalendar.ts';
import type { ProviderBarObservation, ProviderBatch } from './CanonicalMarketDataIngestionService.ts';

/** Version stamp of the canonical daily-bar series. Part of every bar key. */
export const CANONICAL_DAILY_BAR_VERSION = 'v1.0.0-canonical-1d';

/** The authoritative daily series: KBS bars under the canonical daily version. */
export const AUTHORITATIVE_DAILY_SERIES = {
  source: 'KBS',
  dataVersion: CANONICAL_DAILY_BAR_VERSION,
} as const;

/**
 * KBS is a broker's web backend, not the exchange: TIER_3_SECONDARY under the
 * project's tier definitions (TIER_2_EXCHANGE is reserved for HOSE/HNX themselves).
 */
const KBS_SOURCE_TIER = 'TIER_3_SECONDARY' as const;

export function instrumentIdFor(symbol: string, exchange: VnExchange): string {
  return `${exchange}:${symbol.trim().toUpperCase()}`;
}

/** Exchange of a supported symbol, or null — never a guessed default. */
export function supportedExchangeOf(symbol: string): VnExchange | null {
  const clean = symbol.trim().toUpperCase();
  return asVnExchange(VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === clean)?.exchange);
}

export interface KbsDailyFetch {
  readonly batch: ProviderBatch;
  /** Bars KBS returned for sessions that are not final yet; withheld. */
  readonly withheldInProgress: number;
  /** The latest session whose bar may be stored at the time of the fetch. */
  readonly lastFinalSession: string | null;
}

export async function fetchKbsDailyBatch(opts: {
  readonly symbol: string;
  readonly exchange: VnExchange;
  readonly from: string;
  readonly to: string;
  readonly now: Date;
  readonly timeoutMs?: number;
}): Promise<KbsDailyFetch> {
  const symbol = opts.symbol.trim().toUpperCase();
  const instrumentId = instrumentIdFor(symbol, opts.exchange);
  const lastFinal = lastFinalizedSession(opts.now);
  const bars = await KbsHistoricalProvider.getDailyHistory(symbol, opts.from, opts.to, {
    timeoutMs: opts.timeoutMs ?? 10_000,
  });

  const final = lastFinal === null ? [] : bars.filter((b) => b.date <= lastFinal);
  const observations: ProviderBarObservation[] = final.map((b) => ({
    instrumentId,
    symbol,
    exchange: opts.exchange,
    timeframe: '1D' as const,
    // KBS supplies a trading date only. The bar is closed at the exchange close, so
    // the bar instant is that date at 07:00 UTC = 14:00 ICT; publication is taken as
    // 08:00 UTC = 15:00 ICT. Deterministic, documented mapping.
    barTime: `${b.date}T07:00:00.000Z`,
    tradingDate: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    turnoverVnd: b.value > 0 ? b.value : null,
    sourceRecordId: `KBS|${symbol}|1D|${b.date}`,
    publicationTime: `${b.date}T08:00:00.000Z`,
  }));

  return {
    batch: {
      source: 'KBS',
      sourceTier: KBS_SOURCE_TIER,
      provider: 'KbsHistoricalProvider',
      providerVersion: null,
      dataVersion: CANONICAL_DAILY_BAR_VERSION,
      sourceUrl: `https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/${symbol}/data_day`,
      observations,
    },
    withheldInProgress: bars.length - final.length,
    lastFinalSession: lastFinal,
  };
}
