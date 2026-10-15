import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vpsMarketDataProvider } from '../providers/VPSMarketDataProvider';
import { RealMarketDataProvider } from '../RealMarketDataProvider';
import { resolveDataFreshness } from '../freshness/dataFreshness';
import {
  DataUnavailableError,
  PROVIDER_MATRIX,
  runWithFallback,
} from '../providers/providerMatrix';
import { classifyProviderError, classifyProviderFailure, providerHealth } from '../providers/providerHealth';
import { resetProviderGuards } from '../providers/providerGuard';
import { formatIndexPoint, formatVND, formatPercent } from '../../../utils/formatters';
import { getRealtimeQuote } from '../realMarketDataService';
import { EtfDataProvider } from '../../etf/EtfDataProvider';
import { DerivativesDataProvider } from '../../derivatives/DerivativesDataProvider';
import type { MarketQuote } from '../types';

/**
 * P27 §24 — ANTI-FABRICATION TESTS.
 *
 * Every case below is a rule the product is not allowed to break:
 *   1. provider unavailable          -> DATA_UNAVAILABLE, never a `0` quote
 *   2. stale observation             -> STALE, never CURRENT
 *   3. index without a source        -> `--`, never a hardcoded level
 *   4. fallback                      -> source = the provider that actually answered
 *   5. malformed payload             -> INVALID, never a retry, never parsed
 *   6. a field the vendor omitted    -> stays null, never 0 / never inherited
 *   7. stale data inside the cache   -> stays STALE, never re-stamped CURRENT
 *
 * No test in this file touches the network: provider seams are mocked and only
 * REAL captured VPS payloads (or payloads that deliberately omit fields) are used.
 */

beforeEach(() => {
  providerHealth.reset();
  resetProviderGuards();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  providerHealth.reset();
  resetProviderGuards();
});

/** A real-shaped VPS record for HPG, with every optional field present. */
const REAL_HPG_RAW = {
  sym: 'HPG',
  lastPrice: 21.7,
  openPrice: 21.75,
  highPrice: 21.8,
  lowPrice: 21.6,
  avePrice: 21.7,
  r: 21.6,
  c: 23.1,
  f: 20.1,
  changePc: 0.46,
  lot: 1392090,
};

function quoteWithTimestamp(base: MarketQuote, iso: string): MarketQuote {
  return { ...base, marketTimestamp: iso };
}

describe('§24.0 — VPS `lot` is LOTS, never shares (10x unit bug)', () => {
  it('normalizes lot to shares and derives turnover as VWAP x shares', () => {
    const quote = vpsMarketDataProvider.normalizeQuote(REAL_HPG_RAW);

    // 1,392,090 lots x 10 = 13,920,900 shares == KBS volume for the same session.
    expect(quote.volume).toBe(13_920_900);
    // Turnover is derived from the real VWAP and the real share volume.
    expect(quote.totalValue).toBe(Math.round(21.7 * 1000 * 13_920_900));
  });

  it('leaves volume and turnover null when `lot` is absent instead of reporting 0', () => {
    const quote = vpsMarketDataProvider.normalizeQuote({ ...REAL_HPG_RAW, lot: undefined });

    expect(quote.volume).toBeNull();
    expect(quote.totalValue).toBeNull();
  });
});

describe('§24.1 — provider unavailable yields DATA_UNAVAILABLE, never a 0 quote', () => {
  it('a VPS record with no price normalizes to price=null and dataStatus=UNAVAILABLE', () => {
    const quote = vpsMarketDataProvider.normalizeQuote({ sym: 'HPG' });

    expect(quote.price).toBeNull();
    expect(quote.dataStatus).toBe('UNAVAILABLE');
    // Not a single field was invented as 0.
    expect(quote.change).toBeNull();
    expect(quote.changePercent).toBeNull();
    expect(quote.volume).toBeNull();
    expect(quote.open).toBeNull();
    expect(quote.high).toBeNull();
    expect(quote.low).toBeNull();
    expect(quote.refPrice).toBeNull();
    expect(quote.ceilingPrice).toBeNull();
    expect(quote.floorPrice).toBeNull();
    expect(quote.totalValue).toBeNull();

    // The UI must render `--`, not `0`.
    expect(formatVND(quote.price)).toBe('--');
    expect(formatPercent(quote.changePercent)).toBe('--');
  });

  it('an unpriced symbol is NOT emitted as a zero-priced universe row', async () => {
    const provider = new RealMarketDataProvider();
    vi.spyOn(vpsMarketDataProvider, 'getQuotes').mockResolvedValue([
      vpsMarketDataProvider.normalizeQuote({ sym: 'HPG' }),
    ]);

    const rows = await provider.getAllStocks();

    expect(rows.find((r) => r.symbol === 'HPG')).toBeUndefined();
    expect(rows.some((r) => r.price === 0)).toBe(false);
    expect(rows.every((r) => typeof r.price === 'number' && r.price > 0)).toBe(true);
  });

  it('a failing quote provider rejects with MarketDataUnavailableError instead of answering 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    );

    await expect(getRealtimeQuote('HPG', { forceRefresh: true })).rejects.toMatchObject({
      name: 'MarketDataUnavailableError',
      source: 'VPS',
    });
  });
});

describe('§24.2 — an old observation is STALE, never CURRENT', () => {
  it('resolveDataFreshness refuses CURRENT for an observation past the 120 s TTL', () => {
    const now = Date.now();
    const stale = resolveDataFreshness({
      sourceTimestamp: new Date(now - 10 * 60_000).toISOString(),
      referenceTimeMs: now,
      ttlMs: 120_000,
    });

    expect(stale.status).toBe('STALE');
    expect(stale.status).not.toBe('CURRENT');
    expect(stale.ageMs).toBeGreaterThan(120_000);
  });

  it('a universe summary built from an old quote carries dataFreshness=STALE', async () => {
    const provider = new RealMarketDataProvider();
    const oldIso = new Date(Date.now() - 10 * 60_000).toISOString();
    vi.spyOn(vpsMarketDataProvider, 'getQuotes').mockResolvedValue([
      quoteWithTimestamp(vpsMarketDataProvider.normalizeQuote(REAL_HPG_RAW), oldIso),
    ]);

    const rows = await provider.getAllStocks();

    expect(rows).toHaveLength(1);
    expect(rows[0].dataFreshness).toBe('STALE');
    expect(rows[0].dataFreshness).not.toBe('CURRENT');
    expect(rows[0].sourceTimestamp).toBe(oldIso);
  });
});

describe('§24.3 — an index without a source renders `--`, never a hardcoded level', () => {
  it('every index level is null / UNAVAILABLE when the provider supplies nothing', async () => {
    const provider = new RealMarketDataProvider();
    vi.spyOn(vpsMarketDataProvider, 'getQuotes').mockResolvedValue([]);

    const indices = await provider.getMarketIndices();

    expect(indices).toHaveLength(4);
    for (const idx of indices) {
      expect(idx.value).toBeNull();
      expect(idx.change).toBeNull();
      expect(idx.sparkline).toBeNull();
      expect(idx.levelSource).toBe('UNAVAILABLE');
      expect(idx.isDemo).toBe(false);
      // The UI path renders `--` for a null level.
      expect(formatIndexPoint(idx.value)).toBe('--');
    }

    // No hardcoded base level may survive anywhere in the payload.
    const serialized = JSON.stringify(indices);
    expect(serialized).not.toContain('1320.5');
    expect(serialized).not.toContain('1285');
  });

  it('the matrix declares index as UNAVAILABLE with no registered provider', () => {
    const route = PROVIDER_MATRIX.index;
    expect(route.status).toBe('UNAVAILABLE');
    expect(route.providers).toEqual([]);
  });
});

describe('§24.4 — fallback reports the provider that ACTUALLY answered', () => {
  it('returns the secondary source and retains the primary failure', async () => {
    const result = await runWithFallback<string>('history', [
      {
        provider: 'VPS',
        run: async () => {
          throw new Error('VPS has no daily history endpoint');
        },
      },
      { provider: 'KBS', run: async () => 'REAL_KBS_BARS' },
    ]);

    expect(result.value).toBe('REAL_KBS_BARS');
    expect(result.source).toBe('KBS');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ provider: 'VPS', errorCode: 'PROVIDER_ERROR' });
  });

  it('an exhausted chain terminates in DataUnavailableError carrying every attempt', async () => {
    const runners = [
      {
        provider: 'VPS',
        run: async () => {
          throw new Error('boom');
        },
      },
      {
        provider: 'KBS',
        run: async () => {
          throw new Error('boom too');
        },
      },
    ];

    await expect(runWithFallback('quote', runners)).rejects.toMatchObject({
      name: 'DataUnavailableError',
      code: 'DATA_UNAVAILABLE',
      attempts: [
        { provider: 'VPS', errorCode: 'PROVIDER_ERROR' },
        { provider: 'KBS', errorCode: 'PROVIDER_ERROR' },
      ],
    });
  });

  it('a capability with an empty chain fails immediately with no network attempt', async () => {
    await expect(runWithFallback('index', [])).rejects.toBeInstanceOf(DataUnavailableError);
    await expect(runWithFallback('marketCap', [])).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE' });
  });
});

describe('§24.5 — a malformed payload is INVALID, never retried, never parsed', () => {
  it('classifies a MALFORMED failure as non-retryable INVALID', () => {
    const verdict = classifyProviderFailure({ kind: 'MALFORMED', message: 'Unexpected token < in JSON' });

    expect(verdict.state).toBe('INVALID');
    expect(verdict.retryable).toBe(false);
    expect(verdict.errorCode).toBe('MALFORMED_PAYLOAD');
  });

  it('recognizes an unparseable JSON body as MALFORMED', () => {
    const failure = classifyProviderError(new SyntaxError('Unexpected token < in JSON at position 0'));

    expect(failure.kind).toBe('MALFORMED');
    expect(classifyProviderFailure(failure).state).toBe('INVALID');
  });
});

describe('§24.6 — a field the vendor omitted stays null (no inheritance, no zero)', () => {
  it('derives DIRECTION from real prices, never from the vendor magnitude fields', () => {
    // Live-captured 2026-10-07: HPG closed 20,350 against a 20,500 reference
    // (a DECLINE) while the feed reported `ot: "0.15"` and `changePc: "0.73"` —
    // both positive. All 68 universe rows were positive while 40 of them
    // actually fell, so trusting these fields fabricates an all-green market.
    const decliner = vpsMarketDataProvider.normalizeQuote({
      sym: 'HPG',
      lastPrice: 20.35,
      r: 20.5,
      closePrice: '20500.0',
      ot: '0.15',
      changePc: '0.73',
    });

    expect(decliner.price).toBe(20_350);
    expect(decliner.refPrice).toBe(20_500);
    expect(decliner.change).toBe(-150);
    expect(decliner.changePercent).toBe(-0.73);
    expect(formatPercent(decliner.changePercent)).toContain('-0.73');
  });

  it('does not invent a direction when the reference price is missing', () => {
    const quote = vpsMarketDataProvider.normalizeQuote({
      sym: 'HPG',
      lastPrice: 20.35,
      ot: '0.15',
      changePc: '0.73',
    });

    expect(quote.price).toBe(20_350);
    expect(quote.refPrice).toBeNull();
    expect(quote.change).toBeNull();
    expect(quote.changePercent).toBeNull();
  });

  it('ETF and derivatives quotes derive the same signed percentage', () => {
    const etf = EtfDataProvider.normalizeQuote(
      'E1VFVN30',
      { sym: 'E1VFVN30', lastPrice: '34.00', r: '34.55', changePc: '1.59' },
      '2026-10-07T02:00:00.000Z'
    );
    expect(etf.change).toBe(-550);
    expect(etf.changePercent).toBe(-1.59);

    const futures = DerivativesDataProvider.normalizeFuturesQuote(
      'VN30F1M',
      { sym: 'VN30F1M', lastPrice: '1310.0', r: '1320.0', changePc: '0.76' },
      'VN30'
    );
    expect(futures.change).toBe(-10);
    expect(futures.changePercent).toBe(-0.76);
  });

  it('prefers the exchange reference price `r` over a stale closePrice', () => {
    // Live-captured 2026-10-07: GMD's `closePrice` said 78,000 while the
    // reference `r` was 52 (52,000 VND) and the vendor's own `ot` (2.20) and
    // KBS's previous close both agree with `r`.
    const quote = vpsMarketDataProvider.normalizeQuote({
      sym: 'GMD',
      lastPrice: 54.2,
      r: 52,
      closePrice: '78000.0',
      ot: '2.20',
      changePc: '4.23',
    });

    expect(quote.refPrice).toBe(52_000);
    expect(quote.change).toBe(2_200);
    expect(quote.changePercent).toBe(4.23);
  });

  it('normalizeQuote keeps absent OHLC/volume/change fields null while keeping a real price', () => {
    const quote = vpsMarketDataProvider.normalizeQuote({ sym: 'HPG', lastPrice: 21.7 });

    // Real price, normalized from kVND.
    expect(quote.price).toBe(21_700);
    expect(quote.dataStatus).not.toBe('UNAVAILABLE');
    // Everything the payload did NOT carry stays null.
    expect(quote.refPrice).toBeNull();
    expect(quote.previousClose).toBeNull();
    expect(quote.change).toBeNull();
    expect(quote.changePercent).toBeNull();
    expect(quote.open).toBeNull();
    expect(quote.high).toBeNull();
    expect(quote.low).toBeNull();
    expect(quote.volume).toBeNull();
    expect(quote.totalValue).toBeNull();
    expect(quote.ceilingPrice).toBeNull();
    expect(quote.floorPrice).toBeNull();
  });

  it('fundamentals without ratio rows report null metrics, never 0%', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ symbol: 'HPG' }), { status: 200 }))
    );

    const fundamentals = await vpsMarketDataProvider.getFundamentals('HPG');
    const m = fundamentals.metrics;

    expect(fundamentals.dataStatus).toBe('OK');
    for (const value of Object.values(m)) {
      expect(value === null || typeof value === 'number').toBe(true);
      expect(value).not.toBe(0);
    }
    // Metrics the VPS payload genuinely has no source for stay UNAVAILABLE.
    expect(m.dividendYield).toBeNull();
    expect(m.revenueGrowthYoY).toBeNull();
    expect(m.profitGrowthYoY).toBeNull();
    expect(m.sharesOutstanding).toBeNull();
    expect(m.marketCapBillion).toBeNull();
    expect(formatPercent(m.roe)).toBe('--');
  });
});

describe('§12 — breadth coverage is explicit, never presented as whole-market breadth', () => {
  it('counts only members with a usable change and reports the coverage that was measured', async () => {
    const provider = new RealMarketDataProvider();
    vi.spyOn(vpsMarketDataProvider, 'getQuotes').mockResolvedValue([
      // Real price, but no reference/change in the payload -> change stays null.
      vpsMarketDataProvider.normalizeQuote({ sym: 'HPG', lastPrice: 21.7 }),
      // Full record -> a real advance.
      vpsMarketDataProvider.normalizeQuote({ ...REAL_HPG_RAW, sym: 'FPT' }),
    ]);

    const breadth = await provider.getMarketBreadth();

    expect(breadth.coverage.coveredStocks).toBe(2);
    expect(breadth.coverage.pricedStocks).toBe(1);
    expect(breadth.coverage.percentPriced).toBe(50);
    expect(breadth.coverage.universe).toBe('VN_STOCK_UNIVERSE');
    expect(breadth.coverage.note).toMatch(/covered/i);
    // The null-change member is not silently counted as "unchanged".
    expect(breadth.advances + breadth.declines + breadth.unchanged).toBe(1);
    expect(breadth.advances).toBe(1);
    expect(breadth.totalStocks).toBe(2);
    expect(breadth.isDemo).toBe(false);
  });
});

describe('§24.7 — stale data inside the cache stays STALE', () => {
  it('a cached summary is not re-stamped CURRENT on the cache read', async () => {
    const provider = new RealMarketDataProvider();
    const oldIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const getQuotes = vi
      .spyOn(vpsMarketDataProvider, 'getQuotes')
      .mockResolvedValue([
        quoteWithTimestamp(vpsMarketDataProvider.normalizeQuote(REAL_HPG_RAW), oldIso),
      ]);

    const first = await provider.getAllStocks();
    const second = await provider.getAllStocks(); // served from the 2.5 s sweep cache

    expect(getQuotes).toHaveBeenCalledTimes(1);
    expect(first[0].dataFreshness).toBe('STALE');
    expect(second[0].dataFreshness).toBe('STALE');
    expect(second[0].dataFreshness).not.toBe('CURRENT');
    expect(second[0].sourceTimestamp).toBe(first[0].sourceTimestamp);
  });

  it('cache rows served after a provider failure are degraded, never promoted to CURRENT', async () => {
    const provider = new RealMarketDataProvider();
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);

    const getQuotes = vi
      .spyOn(vpsMarketDataProvider, 'getQuotes')
      .mockResolvedValue([vpsMarketDataProvider.normalizeQuote(REAL_HPG_RAW)]);

    const first = await provider.getAllStocks();
    expect(first[0].dataFreshness).toBe('CURRENT');

    // 10 minutes later the sweep cache has expired and the provider is down.
    nowSpy.mockReturnValue(realNow + 10 * 60_000);
    getQuotes.mockRejectedValue(new Error('VPS unreachable'));

    const degraded = await provider.getAllStocks();

    expect(degraded).toHaveLength(1);
    expect(degraded[0].dataFreshness).toBe('STALE');
    expect(degraded[0].dataFreshness).not.toBe('CURRENT');
    // The observation time is preserved, not refreshed to "now".
    expect(Date.parse(degraded[0].sourceTimestamp as string)).toBeLessThanOrEqual(
      realNow + 10 * 60_000
    );
    nowSpy.mockRestore();
  });
});
