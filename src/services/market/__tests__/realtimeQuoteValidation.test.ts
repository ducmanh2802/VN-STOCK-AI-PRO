/**
 * getRealtimeQuote end to end: the OK path and the non-OK paths through the real
 * service, with provider HTTP stubbed.
 *
 * FIXTURES ARE CONSTRUCTED, NOT CAPTURED. They are shaped exactly like the vendor
 * payloads (VPS prices in kVND, KBS newest-first) so the real normalizers run, but the
 * numbers are chosen to be mutually consistent for a known session. They exist only to
 * drive the validator and are never served by any production path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRealtimeQuote } from '../realMarketDataService.ts';
import { cacheClear } from '../marketDataCache.ts';

/** Friday 2026-04-10, 10:00 in Hanoi. */
const SESSION_NOW = new Date('2026-04-10T03:00:00.000Z');

const VPS_HPG = [
  { sym: 'HPG', lastPrice: 28.5, openPrice: 28.1, highPrice: 28.6, lowPrice: 28.0, avePrice: 28.3, r: 28.0, c: 29.95, f: 26.05, changePc: '1.79', lot: 1_000_000 },
];

const kbsEnvelope = (bars: [string, number, number, number, number][]) => ({
  symbol: 'HPG',
  data_day: bars.map(([date, o, h, l, c]) => ({ t: `${date} 07:00`, o, h, l, c, v: 10_000_000, va: c * 10_000_000 })).reverse(),
});

function stubProviders(kbs: object | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('bgapidatafeed.vps.com.vn/getliststockdata')) {
        return Promise.resolve(new Response(JSON.stringify(VPS_HPG), { status: 200 }));
      }
      if (url.includes('kbbuddywts.kbsec.com.vn')) {
        return kbs instanceof Error ? Promise.reject(kbs) : Promise.resolve(new Response(JSON.stringify(kbs), { status: 200 }));
      }
      return Promise.reject(new TypeError(`unexpected url ${url}`));
    })
  );
}

beforeEach(() => {
  cacheClear();
  vi.useFakeTimers({ toFake: ['Date'], now: SESSION_NOW });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getRealtimeQuote — validated before it can be OK', () => {
  it('OK when the price is inside the published band and the reference equals the previous KBS close', async () => {
    stubProviders(kbsEnvelope([
      ['2026-04-08', 27_700, 28_000, 27_600, 27_900],
      ['2026-04-09', 27_900, 28_100, 27_800, 28_000],
    ]));
    const q = await getRealtimeQuote('HPG');
    expect(q.dataStatus).toBe('OK');
    expect(q.error).toBeUndefined();
    expect(q.crossCheck.agreement).toBe('AGREE');
    expect(q.validation.priceLimits.exchange).toBe('HOSE');
    expect(q.validation.sessionDate).toBe('2026-04-10');
    expect(q.quote.lastPrice).toBe(28_500);
  });

  it('MISMATCH keeps the raw quote and the diagnostics, and says why', async () => {
    stubProviders(kbsEnvelope([['2026-04-09', 19_900, 20_100, 19_800, 20_000]]));
    const q = await getRealtimeQuote('HPG');
    expect(q.dataStatus).toBe('MISMATCH');
    expect(q.error).toMatch(/^CROSS_SOURCE_MISMATCH: /);
    // Provenance and values are preserved, never replaced by a "convenient" number.
    expect(q.source).toBe('VPS');
    expect(q.quote.lastPrice).toBe(28_500);
    expect(q.crossCheck.kbsClose).toBe(20_000);
    expect(q.crossCheck.kbsDate).toBe('2026-04-09');
  });

  it('UNVERIFIED when the benchmark provider is down', async () => {
    stubProviders(new TypeError('fetch failed'));
    const q = await getRealtimeQuote('HPG');
    expect(q.dataStatus).toBe('UNVERIFIED');
    expect(q.validation.reasonCode).toBe('BENCHMARK_UNAVAILABLE');
  });
});
