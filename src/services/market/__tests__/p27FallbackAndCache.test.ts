import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  coalesceInFlight,
  inflightStats,
  resetInFlight,
} from '../requestCoalescer';
import { cacheClear, cacheGet, cacheSet, cacheStats } from '../marketDataCache';
import {
  getHistoricalStockData,
  getRealtimeQuote,
  getStockFundamentals,
  MarketDataUnavailableError,
} from '../realMarketDataService';
import { providerHealth } from '../providers/providerHealth';
import { resetProviderGuards } from '../providers/providerGuard';
import { fallbackStats, resetFallbackStats, runWithFallback } from '../providers/providerMatrix';

/**
 * P27 §17 / §18 / §19 — cache, in-flight coalescing and fallback provenance.
 *
 * Real captured VPS/KBS payload shapes only; every network call is stubbed.
 */

/** REAL-shaped KBS daily bars for HPG (newest-first, exactly as the vendor returns). */
const KBS_BARS = [
  { t: '2026-07-22 07:00', o: 20900, h: 21000, l: 20500, c: 20700, v: 4347190, va: 900618795000 },
  { t: '2026-07-23 07:00', o: 20700, h: 21000, l: 20150, c: 20800, v: 36967600, va: 763617890000 },
  { t: '2026-07-24 07:00', o: 20700, h: 21000, l: 20600, c: 20800, v: 17636160, va: 686610800000 },
];

const KBS_ENVELOPE = { symbol: 'HPG', data_day: KBS_BARS };

const VPS_QUOTE_PAYLOAD = [
  {
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
  },
];

const VPS_BASEINFO_PAYLOAD = {
  symbol: 'HPG',
  ttQuy: [{ TermCode: 'Q2', TermName: 'Quý 2', YearPeriod: 2026, Row: 1 }],
  chisoTCQuy: [
    { NameEn: 'Trailing EPS', Value1: 2080 },
    { NameEn: 'Book value per share', Value1: 21750 },
    { NameEn: 'P/E', Value1: 10.4 },
    { NameEn: 'ROEA', Value1: 14.2 },
  ],
};

function isKbs(url: string): boolean {
  return url.includes('kbbuddywts.kbsec.com.vn') && url.includes('data_day');
}
function isVpsQuote(url: string): boolean {
  return url.includes('bgapidatafeed.vps.com.vn/getliststockdata');
}
function isVpsBaseInfo(url: string): boolean {
  return url.includes('bgapidatafeed.vps.com.vn/getliststockbaseinfo');
}

beforeEach(() => {
  cacheClear();
  resetInFlight();
  resetFallbackStats();
  providerHealth.reset();
  resetProviderGuards();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cacheClear();
  resetInFlight();
  resetFallbackStats();
  providerHealth.reset();
  resetProviderGuards();
});

describe('§18 — in-flight request coalescing', () => {
  it('collapses concurrent identical requests into ONE provider call', async () => {
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'REAL_RESULT';
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => coalesceInFlight('quote:HPG', factory))
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(20);
    expect(results.every((r) => r === 'REAL_RESULT')).toBe(true);
  });

  it('releases the slot after success so a later request can fetch again', async () => {
    const factory = vi.fn(async () => 'V1');
    await coalesceInFlight('k', factory);
    expect(inflightStats().size).toBe(0);

    await coalesceInFlight('k', factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('never memoizes a FAILED promise — the next caller retries', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('vendor down'))
      .mockResolvedValueOnce('RECOVERED');

    await expect(coalesceInFlight('q:HPG', factory)).rejects.toThrow('vendor down');
    // The failed slot must already be released.
    expect(inflightStats().size).toBe(0);

    const recovered = await coalesceInFlight('q:HPG', factory);
    expect(recovered).toBe('RECOVERED');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers all observe the same rejection (no swallowed error)', async () => {
    const factory = vi.fn(async () => {
      throw new Error('upstream 500');
    });

    const settled = await Promise.allSettled([
      coalesceInFlight('s:HNX', factory),
      coalesceInFlight('s:HNX', factory),
      coalesceInFlight('s:HNX', factory),
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(inflightStats().size).toBe(0);
  });
});

describe('§17 — TTL cache', () => {
  it('returns a value inside its TTL and misses after it expires', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    cacheSet('quote:HPG', { price: 21_700 }, 15_000);
    expect(cacheGet('quote:HPG')).toEqual({ price: 21_700 });

    nowSpy.mockReturnValue(1_000_000 + 14_999);
    expect(cacheGet('quote:HPG')).toEqual({ price: 21_700 });

    nowSpy.mockReturnValue(1_000_000 + 15_000);
    expect(cacheGet('quote:HPG')).toBeUndefined();
    nowSpy.mockRestore();
  });

  it('ignores a non-positive or non-finite TTL instead of caching forever', () => {
    cacheSet('bad:neg', 'x', -1);
    cacheSet('bad:zero', 'x', 0);
    cacheSet('bad:nan', 'x', Number.NaN);
    expect(cacheGet('bad:neg')).toBeUndefined();
    expect(cacheGet('bad:zero')).toBeUndefined();
    expect(cacheGet('bad:nan')).toBeUndefined();
    expect(cacheStats().size).toBe(0);
  });

  it('clearing the cache drops every entry', () => {
    cacheSet('a', 1, 60_000);
    cacheSet('b', 2, 60_000);
    cacheClear();
    // §27 hit/miss counters are process-lifetime measurements, not cache state:
    // clearing entries must not erase what has already been measured.
    const stats = cacheStats();
    expect(stats.size).toBe(0);
    expect(stats.keys).toEqual([]);
    expect(stats.hits).toBeGreaterThanOrEqual(0);
    expect(stats.misses).toBeGreaterThanOrEqual(0);
  });
});

describe('§17/§19 — provider results are cached, failures are not', () => {
  it('returns the ACTUAL source that answered for history and caches it', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (isKbs(url)) return Promise.resolve(new Response(JSON.stringify(KBS_ENVELOPE), { status: 200 }));
      return Promise.reject(new TypeError(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await getHistoricalStockData('HPG', '3M');
    const second = await getHistoricalStockData('HPG', '3M');

    expect(first.source).toBe('KBS');
    expect(second.source).toBe('KBS');
    expect(first.count).toBe(KBS_BARS.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cacheStats().keys).toContain('history:HPG:3M');
  });

  it('returns the ACTUAL source for a quote and caches it', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (isVpsQuote(url)) {
        return Promise.resolve(new Response(JSON.stringify(VPS_QUOTE_PAYLOAD), { status: 200 }));
      }
      if (isKbs(url)) {
        return Promise.resolve(new Response(JSON.stringify(KBS_ENVELOPE), { status: 200 }));
      }
      return Promise.reject(new TypeError(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const quote = await getRealtimeQuote('HPG');

    expect(quote.source).toBe('VPS');
    expect(quote.dataStatus).toBe('OK');
    expect(quote.quote.lastPrice).toBe(21_700);
    // The cross-check is advisory metadata derived from a real KBS bar.
    expect(quote.crossCheck.benchmarkSource).toBe('KBS');
    expect(['OK', 'MISMATCH', 'UNVERIFIED']).toContain(quote.crossCheck.status);

    await getRealtimeQuote('HPG');
    expect(cacheStats().keys).toContain('quote:HPG');
  });

  it('reports a SIGNED percentage from real prices, never the vendor magnitude', async () => {
    // Live-captured 2026-10-07: HPG fell 20,500 -> 20,350 while the feed sent
    // `ot: "0.15"` and `changePc: "0.73"` (both positive).
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (isVpsQuote(url)) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                sym: 'HPG',
                lastPrice: 20.35,
                r: 20.5,
                closePrice: '20500.0',
                ot: '0.15',
                changePc: '0.73',
                lot: 1392090,
              },
            ]),
            { status: 200 }
          )
        );
      }
      if (isKbs(url)) {
        return Promise.resolve(new Response(JSON.stringify(KBS_ENVELOPE), { status: 200 }));
      }
      return Promise.reject(new TypeError(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const quote = await getRealtimeQuote('HPG', { forceRefresh: true });

    expect(quote.quote.lastPrice).toBe(20_350);
    expect(quote.quote.referencePrice).toBe(20_500);
    expect(quote.quote.change).toBe(-150);
    expect(quote.quote.changePercent).toBe(-0.73);
  });

  it('never caches a failure — the error stays visible to the next caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(getStockFundamentals('HPG', { forceRefresh: true })).rejects.toBeInstanceOf(
      MarketDataUnavailableError
    );

    // No fundamentals entry may exist after a failure.
    expect(cacheStats().keys.filter((k) => k.startsWith('fundamentals:'))).toHaveLength(0);
    expect(inflightStats().size).toBe(0);

    // A retry must reach the provider again rather than replaying a cached error.
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await expect(getStockFundamentals('HPG', { forceRefresh: true })).rejects.toBeInstanceOf(
      MarketDataUnavailableError
    );
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
    expect(cacheStats().keys.filter((k) => k.startsWith('fundamentals:'))).toHaveLength(0);
  });

  it('refuses an unsupported timeframe without touching the cache or the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHistoricalStockData('HPG', '1D')).rejects.toBeInstanceOf(MarketDataUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheStats().size).toBe(0);
  });
});

describe('§8 — deterministic fallback retains real values only', () => {
  it('passes through the provider value untouched (no normalization, no invention)', async () => {
    const realPayload = { price: 21_700, change: 100, volume: null };

    const result = await runWithFallback<{ price: number; change: number; volume: number | null }>('quote', [
      { provider: 'KBS', run: async () => { throw new Error('KBS has no realtime quote'); } },
      { provider: 'VPS', run: async () => realPayload },
    ]);

    expect(result.value).toBe(realPayload);
    expect(result.value.price).toBe(21_700);
    expect(result.value.volume).toBeNull();
    expect(result.source).toBe('VPS');
    expect(result.attempts[0]).toMatchObject({ provider: 'KBS' });
  });
});

describe('§27 — cache hit rate is measured, not assumed', () => {
  it('counts a served hit and an unserved miss as deltas from the running counters', () => {
    const before = cacheStats();

    cacheSet('p27:perf:probe', { price: 21_700 }, 50);
    expect(cacheGet('p27:perf:probe')).toEqual({ price: 21_700 });
    expect(cacheGet('p27:perf:never-written')).toBeUndefined();

    const after = cacheStats();
    expect(after.hits - before.hits).toBe(1);
    expect(after.misses - before.misses).toBe(1);
    expect(after.size).toBeGreaterThanOrEqual(before.size);
  });

  it('counts an expired entry as a miss — it was requested but not served', async () => {
    const before = cacheStats();
    cacheSet('p27:perf:expired', { price: 1 }, 1);
    await new Promise((r) => setTimeout(r, 5));

    expect(cacheGet('p27:perf:expired')).toBeUndefined();
    expect(cacheStats().misses - before.misses).toBe(1);
  });
});

describe('§27 — fallback rate and deduplication are measured', () => {
  it('counts a primary-only success as a request, not a fallback', async () => {
    await runWithFallback('history', [{ provider: 'KBS', run: async () => 'CANDLES' }]);

    expect(fallbackStats()).toEqual({ requests: 1, fallbacks: 0, exhausted: 0 });
  });

  it('counts a secondary answering after a primary failure as a fallback', async () => {
    await runWithFallback('history', [
      { provider: 'KBS', run: async () => { throw new Error('KBS down'); } },
      { provider: 'VPS', run: async () => 'CANDLES' },
    ]);

    expect(fallbackStats()).toEqual({ requests: 1, fallbacks: 1, exhausted: 0 });
  });

  it('counts an exhausted chain as exhausted, including an empty chain', async () => {
    await expect(
      runWithFallback('history', [{ provider: 'KBS', run: async () => { throw new Error('down'); } }])
    ).rejects.toBeInstanceOf(Error);
    await expect(runWithFallback('index', [{ provider: 'VPS', run: async () => 1 }])).rejects.toBeInstanceOf(Error);

    expect(fallbackStats()).toEqual({ requests: 2, fallbacks: 0, exhausted: 2 });
  });

  it('counts callers that joined an already-running request', async () => {
    const before = inflightStats().coalesced;
    const factory = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'REAL';
    };

    await Promise.all(Array.from({ length: 5 }, () => coalesceInFlight('quote:VCB', factory)));

    expect(inflightStats().coalesced - before).toBe(4);
  });
});
