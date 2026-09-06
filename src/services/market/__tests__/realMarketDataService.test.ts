import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHistoricalStockData,
  getRealtimeQuote,
  getStockFundamentals,
  MarketDataUnavailableError,
} from '../realMarketDataService.ts';
import { buildChartDataBundleFromCandles } from '../stockHistory.ts';
import { cacheClear } from '../marketDataCache.ts';
import { StockAnalysisEngine } from '../../../lib/analysis/technical/StockAnalysisEngine.ts';

/**
 * PHASE 8.5C STEP 15 — real market data service tests.
 *
 * The KBS fixture below is REAL captured data for HPG
 * (https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/HPG/data_day,
 * 2026-06-01 .. 2026-07-24). No synthetic OHLCV is used anywhere in this suite.
 */

// 40 REAL HPG daily bars, chronological (date, o, h, l, c, v, va).
const REAL_HPG_BARS: [string, number, number, number, number, number, number][] = [
  ['2026-06-01', 24000, 24150, 23950, 24050, 9668300, 608131155000],
  ['2026-06-02', 24000, 24050, 23700, 23700, 25529600, 608131155000],
  ['2026-06-03', 23700, 24150, 23600, 24150, 20573500, 491246180000],
  ['2026-06-04', 24150, 24150, 23900, 23950, 10065300, 241494515000],
  ['2026-06-05', 23950, 24050, 23750, 23750, 13891200, 331224185000],
  ['2026-06-08', 23650, 23750, 23300, 23300, 22769900, 535426630000],
  ['2026-06-09', 23350, 23550, 23300, 23550, 12441700, 291702310000],
  ['2026-06-10', 23550, 23700, 23450, 23600, 7505500, 177192185000],
  ['2026-06-11', 23500, 23550, 23300, 23300, 10177700, 238246780000],
  ['2026-06-12', 23550, 23550, 23200, 23200, 13271400, 310009945000],
  ['2026-06-15', 23550, 24350, 23550, 24350, 30695200, 736115820000],
  ['2026-06-16', 24250, 24350, 24100, 24200, 14145800, 342797690000],
  ['2026-06-17', 24200, 24300, 24000, 24000, 19039000, 459864080000],
  ['2026-06-18', 24050, 24150, 23650, 23650, 18040500, 430934450000],
  ['2026-06-19', 23800, 23900, 23600, 23600, 20055700, 475792365000],
  ['2026-06-22', 23700, 23850, 23600, 23600, 10684400, 253084225000],
  ['2026-06-23', 23650, 23700, 23300, 23300, 29071800, 681939835000],
  ['2026-06-24', 23400, 23600, 23300, 23500, 12927300, 302812075000],
  ['2026-06-25', 23500, 23600, 23400, 23400, 7659100, 179795535000],
  ['2026-06-26', 23400, 23500, 23350, 23500, 15468600, 362222885000],
  ['2026-06-29', 23550, 23650, 23450, 23650, 14158200, 333689545000],
  ['2026-06-30', 23700, 23700, 23250, 23300, 30593200, 717054000000],
  ['2026-07-01', 23400, 23550, 23350, 23450, 14937400, 350570710000],
  ['2026-07-02', 23500, 23650, 23350, 23400, 13367500, 313617460000],
  ['2026-07-03', 23400, 23500, 23250, 23250, 15935100, 371670450000],
  ['2026-07-06', 23400, 23600, 23000, 23100, 21299300, 495927610000],
  ['2026-07-07', 23200, 23250, 23000, 23100, 13839600, 319462655000],
  ['2026-07-08', 23150, 23400, 23050, 23200, 12499500, 290026765000],
  ['2026-07-09', 23200, 23250, 23100, 23200, 11643400, 269887235000],
  ['2026-07-10', 23200, 23250, 22950, 22950, 11906800, 274691525000],
  ['2026-07-13', 22950, 22950, 22350, 22400, 32309000, 730005555000],
  ['2026-07-14', 22300, 22500, 22000, 22500, 22481900, 500298330000],
  ['2026-07-15', 22500, 22600, 22150, 22400, 21464500, 478849355000],
  ['2026-07-16', 22300, 22400, 21800, 22200, 22880600, 506024940000],
  ['2026-07-17', 22200, 22350, 21850, 21850, 17006300, 374629000000],
  ['2026-07-20', 21750, 21750, 20500, 20600, 53245200, 1117394605000],
  ['2026-07-21', 20500, 21150, 20500, 20800, 27198700, 567232350000],
  ['2026-07-22', 20900, 21050, 20500, 20700, 43471900, 900618795000],
  ['2026-07-23', 20700, 21000, 20150, 20800, 36967600, 763617890000],

const REAL_KBS_ENVELOPE = {
  symbol: 'HPG',
  // Vendor order is newest-first, exactly as the real endpoint returns.
  data_day: REAL_HPG_BARS.map(([date, o, h, l, c, v, va]) => ({
    t: `${date} 07:00`,
    o,
    h,
    l,
    c,
    v,
    va,
  })).reverse(),
};

const REAL_VPS_QUOTE = [
  {
    sym: 'HPG',
    lastPrice: 21.7,
    openPrice: '21.75',
    highPrice: '21.8',
    lowPrice: '21.6',
    avePrice: '21.7',
    closePrice: '21600.0',
    r: 21.6,
    c: 23.1,
    f: 20.1,
    changePc: '0.46',
    lot: 1392090,
    fBVol: '129368',
    fBValue: '2.8088076E7',
    fSVolume: '459197',
    fSValue: '9.96509442E7',
    fRoom: '230019025.50',
  },
];

const REAL_VPS_BASEINFO = {
  symbol: 'HPG',
  ttQuy: [{ TermCode: 'Q2', TermName: 'Quý 2', YearPeriod: 2021, Row: 1 }],
  ketquaKDQuy: [{ NameEn: 'Net revenue', Value1: 35118355, Value2: 31176875 }],
  chisoTCQuy: [{ NameEn: 'Trailing EPS', Value1: 6915 }],
};

function kbsUrlFor(symbol: string): (url: string) => boolean {
  return (url: string) => url.includes('kbbuddywts.kbsec.com.vn') && url.includes(`/${symbol}/data_day`);
}

function vpsQuoteUrl(symbol: string): (url: string) => boolean {
  return (url: string) => url.includes('bgapidatafeed.vps.com.vn/getliststockdata') && url.endsWith(`/${symbol}`);
}

beforeEach(() => {
  cacheClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getHistoricalStockData (KBS real OHLCV)', () => {
  it('returns REAL KBS candles for a daily timeframe', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (kbsUrlFor('HPG')(url)) {
        return Promise.resolve(new Response(JSON.stringify(REAL_KBS_ENVELOPE), { status: 200 }));
      }
      return Promise.reject(new TypeError(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getHistoricalStockData('HPG', '3M');

    expect(result.source).toBe('KBS');
    expect(result.symbol).toBe('HPG');
    expect(result.count).toBe(REAL_HPG_BARS.length);
    expect(result.candles).toHaveLength(REAL_HPG_BARS.length);
    // REAL vendor dates — not the synthetic baseline '2025-02-28'
    expect(result.from).toBe('2026-06-01');
    expect(result.to).toBe('2026-07-24');
    expect(result.candles[0]).toEqual({
      time: '2026-06-01',
      open: 24000,
      high: 24150,
      low: 23950,
      close: 24050,
      volume: 9668300,
    });
    expect(result.candles.every((c) => String(c.time).startsWith('2026-'))).toBe(true);
  });

  it('caches successful history (second call performs no fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(REAL_KBS_ENVELOPE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getHistoricalStockData('HPG', '3M');
    await getHistoricalStockData('HPG', '3M');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses intraday timeframes with an explicit DATA_UNAVAILABLE (no synthetic candles)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(getHistoricalStockData('HPG', '1D')).rejects.toMatchObject({
      name: 'MarketDataUnavailableError',
      reason: expect.stringContaining('TIMEFRAME_NOT_SUPPORTED'),
    });
  });

  it('NEVER falls back to synthetic data when KBS fails — errors stay visible and are not cached', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHistoricalStockData('HPG', '3M')).rejects.toBeInstanceOf(MarketDataUnavailableError);
    // Second call must hit the source again (failure was NOT cached) and fail again — no fake data.
    await expect(getHistoricalStockData('HPG', '3M')).rejects.toBeInstanceOf(MarketDataUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an empty KBS history as DATA_UNAVAILABLE (never generates candles)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ symbol: 'XYZ', data_day: [] }), { status: 200 }))
    );
    await expect(getHistoricalStockData('XYZ', '1M')).rejects.toMatchObject({
      name: 'MarketDataUnavailableError',
      reason: expect.stringContaining('KBS_EMPTY_HISTORY'),
    });
  });
});

describe('getRealtimeQuote (VPS + KBS cross-check)', () => {
  it('normalizes the VPS quote to VND and cross-checks against the KBS close', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (vpsQuoteUrl('HPG')(url)) {
          return Promise.resolve(new Response(JSON.stringify(REAL_VPS_QUOTE), { status: 200 }));
        }
        if (kbsUrlFor('HPG')(url)) {
          return Promise.resolve(new Response(JSON.stringify(REAL_KBS_ENVELOPE), { status: 200 }));
        }
        return Promise.reject(new TypeError(`unexpected url ${url}`));
      })
    );

    const result = await getRealtimeQuote('HPG');

    expect(result.dataStatus).toBe('OK');
    expect(result.source).toBe('VPS');
    expect(result.quote.lastPrice).toBe(21700);
    expect(result.quote.matchedVolumeShares).toBe(13920900);
    // KBS last close in fixture = 20800 -> deviation ≈ +4.33% -> verified
    expect(result.crossCheck.status).toBe('OK');
    expect(result.crossCheck.kbsClose).toBe(20800);
    expect(result.crossCheck.kbsDate).toBe('2026-07-24');
    expect(result.crossCheck.deviationPercent).toBeCloseTo(4.33, 1);
  });

  it('flags MISMATCH instead of adjusting data when VPS and KBS disagree strongly', async () => {
    const absurdQuote = [{ ...REAL_VPS_QUOTE[0], lastPrice: 99.9 }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (vpsQuoteUrl('HPG')(url)) {
          return Promise.resolve(new Response(JSON.stringify(absurdQuote), { status: 200 }));
        }
        if (kbsUrlFor('HPG')(url)) {
          return Promise.resolve(new Response(JSON.stringify(REAL_KBS_ENVELOPE), { status: 200 }));
        }
        return Promise.reject(new TypeError(`unexpected url ${url}`));
      })
    );

    const result = await getRealtimeQuote('HPG');
    expect(result.quote.lastPrice).toBe(99900);
    expect(result.crossCheck.status).toBe('MISMATCH');
  });

  it('surfaces DATA_UNAVAILABLE when VPS fails (no mock quote fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(getRealtimeQuote('HPG')).rejects.toMatchObject({
      name: 'MarketDataUnavailableError',
      source: 'VPS',
    });
  });
});

describe('getStockFundamentals (VPS)', () => {
  it('returns real VPS fundamentals with explicit AMBIGUOUS period metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('getliststockbaseinfo')) {
          return Promise.resolve(new Response(JSON.stringify(REAL_VPS_BASEINFO), { status: 200 }));
        }
        return Promise.reject(new TypeError(`unexpected url ${url}`));
      })
    );

    const f = await getStockFundamentals('HPG');
    expect(f.dataStatus).toBe('OK');
    expect(f.source).toBe('VPS');
    expect(f.quarterly.netRevenue[0]).toBe(35118355);
    expect(f.quarterly.eps[0]).toBe(6915);
    expect(f.periodMetadata.mappingStatus).toBe('AMBIGUOUS');
    expect(f.periodMetadata.isCurrentPeriodConfirmed).toBe(false);
  });

  it('surfaces DATA_UNAVAILABLE when VPS fundamentals fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(getStockFundamentals('HPG')).rejects.toBeInstanceOf(MarketDataUnavailableError);
  });
});

describe('REAL OHLCV → StockAnalysisEngine (HPG, no synthetic path)', () => {
  it('produces real indicators from real KBS candles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(REAL_KBS_ENVELOPE), { status: 200 }))
    );

    const history = await getHistoricalStockData('HPG', '3M');
    const bundle = buildChartDataBundleFromCandles(history.candles, {
      from: history.from,
      to: history.to,
      latestValueVnd: history.bars[history.bars.length - 1].value,
    });

    expect(bundle.dataSource).toBe('KBS');
    expect(bundle.candles.length).toBeGreaterThan(20);
    expect(bundle.snapshot).not.toBeNull();

    // The engine consumes the REAL candles unchanged.
    const analysis = StockAnalysisEngine.analyze({ candles: history.candles });
    expect(analysis.indicators.sma20).not.toBeNull();
    expect(analysis.indicators.rsi14).not.toBeNull();
    expect(analysis.indicators.atr14).not.toBeNull();
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(100);
    // Guard against any synthetic leak: last candle must be a REAL KBS date/close.
    const last = history.candles[history.candles.length - 1];
    expect(last.time).toBe('2026-07-24');
    expect(last.close).toBe(20800);
  });
});
  ['2026-07-24', 20700, 21000, 20600, 20800, 17632000, 366810800000],
];