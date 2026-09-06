import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KbsHistoricalProvider,
  KbsApiError,
  toKbsDate,
  parseKbsTimestamp,
} from '../../KbsHistoricalProvider.ts';

/**
 * PHASE 8.5C STEP 15 — KBS provider unit tests.
 * All payloads below are captured from the REAL vendor endpoint
 * (https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/HPG/data_day).
 */

const REAL_REVERSE_BARS = [
  // Vendor returns newest-first; includes one duplicate date and one invalid bar.
  { t: '2026-08-28 07:00', o: 22250, h: 22350, l: 22050, c: 22100, v: 17126700, va: 380204245000 },
  { t: '2026-08-27 07:00', o: 22050, h: 22400, l: 22050, c: 22200, v: 19201900, va: 426680415000 },
  { t: '2026-08-27 07:00', o: 22050, h: 22400, l: 22050, c: 22200, v: 19201900, va: 426680415000 }, // duplicate
  { t: '2026-08-26 07:00', o: 21800, h: 999999, l: 21750, c: 22050, v: 19394800, va: 425726480000 }, // corrupt (h < max(o,c) violated)
  { t: '2026-08-25 07:00', o: 22250, h: 22300, l: 21800, c: 21800, v: 25844100, va: 568777710000 },
];

describe('KBS date conversion', () => {
  it('converts ISO YYYY-MM-DD to KBS DD-MM-YYYY', () => {
    expect(toKbsDate('2025-01-01')).toBe('01-01-2025');
    expect(toKbsDate('2026-09-06')).toBe('06-09-2026');
  });

  it('rejects non-ISO dates', () => {
    expect(() => toKbsDate('01-01-2025')).toThrow(KbsApiError);
    expect(() => toKbsDate('garbage')).toThrow(KbsApiError);
  });

  it('extracts the trading date from the vendor timestamp', () => {
    expect(parseKbsTimestamp('2026-08-28 07:00')).toBe('2026-08-28');
    expect(parseKbsTimestamp('2026-09-04 07:00')).toBe('2026-09-04');

describe('KbsHistoricalProvider.getDailyHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the required User-Agent header and correctly encoded query dates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ symbol: 'HPG', data_day: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await KbsHistoricalProvider.getDailyHistory('HPG', '2025-01-01', '2026-09-01');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/HPG/data_day?sdate=01-01-2025&edate=01-09-2026'
    );
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0');
  });

  it('maps KBS fields to the normalized OHLCV structure, sorts ascending and dedupes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ symbol: 'HPG', data_day: REAL_REVERSE_BARS }), { status: 200 })
      )
    );

    const bars = await KbsHistoricalProvider.getDailyHistory('HPG', '2026-08-01', '2026-08-31');

    // duplicate removed + corrupt bar filtered => 3 valid bars
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.date)).toEqual(['2026-08-25', '2026-08-27', '2026-08-28']);

    const last = bars[bars.length - 1];
    expect(last).toEqual({
      date: '2026-08-28',
      open: 22250,
      high: 22350,
      low: 22050,
      close: 22100,
      volume: 17126700,
      value: 380204245000,
    });
    // Volume is in SHARES, value in VND — passed through unchanged from the source.
    expect(bars[1].volume).toBe(19201900);
    expect(bars[1].value).toBe(426680415000);
  });

  it('accepts live-session bars where the vendor omits `va` (value = 0, not fabricated)', async () => {
    const liveBar = { t: '2026-09-04 07:00', o: 21750, h: 21800, l: 21600, c: 21700, v: 13920900 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ symbol: 'HPG', data_day: [liveBar] }), { status: 200 })
      )
    );

    const bars = await KbsHistoricalProvider.getDailyHistory('HPG', '2026-09-01', '2026-09-06');
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(21700);
    expect(bars[0].value).toBe(0);
  });

  it('returns an empty array for an empty data_day (not an error, not synthetic data)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ symbol: 'XYZ', data_day: [] }), { status: 200 })
      )
    );
    const bars = await KbsHistoricalProvider.getDailyHistory('XYZ', '2026-01-01', '2026-01-31');
    expect(bars).toEqual([]);
  });

  it('returns an empty array when data_day is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ symbol: 'XYZ', data_day: null }), { status: 200 })
      )
    );
    const bars = await KbsHistoricalProvider.getDailyHistory('XYZ', '2026-01-01', '2026-01-31');
    expect(bars).toEqual([]);
  });

  it('throws KbsApiError on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error', { status: 500, statusText: 'Internal Server Error' }))
    );
    await expect(KbsHistoricalProvider.getDailyHistory('HPG', '2026-01-01', '2026-01-31')).rejects.toMatchObject({
      name: 'KbsApiError',
      statusCode: 500,
    });
  });

  it('throws KbsApiError on malformed (non-JSON) response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>not json</html>', { status: 200 }))
    );
    await expect(KbsHistoricalProvider.getDailyHistory('HPG', '2026-01-01', '2026-01-31')).rejects.toMatchObject({
      name: 'KbsApiError',
    });
  });

  it('throws KbsApiError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(KbsHistoricalProvider.getDailyHistory('HPG', '2026-01-01', '2026-01-31')).rejects.toMatchObject({
      name: 'KbsApiError',
    });
  });

  it('throws KbsApiError on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        // Never resolves; the provider's AbortController must abort it.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      })
    );
    await expect(
      KbsHistoricalProvider.getDailyHistory('HPG', '2026-01-01', '2026-01-31', { timeoutMs: 25 })
    ).rejects.toMatchObject({ name: 'KbsApiError' });
  });

  it('rejects invalid symbol formats without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(KbsHistoricalProvider.getDailyHistory('H P G!', '2026-01-01', '2026-01-31')).rejects.toBeInstanceOf(
      KbsApiError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
  });
});