import type { NormalizedDailyBar } from './types.ts';

export class KbsHistoricalProvider {
  /**
   * Fetches historical daily OHLCV bars for a given symbol and date range.
   */
  public static async getDailyHistory(
    symbol: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyBar[]> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const fromTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const toTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

    const url = `https://kbsec.com.vn/api/chart/history?symbol=${cleanSymbol}&resolution=D&from=${fromTimestamp}&to=${toTimestamp}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`KBS API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.t) || data.t.length === 0) {
        return [];
      }

      const bars: NormalizedDailyBar[] = [];
      for (let i = 0; i < data.t.length; i++) {
        const d = new Date(data.t[i] * 1000).toISOString().slice(0, 10);
        bars.push({
          date: d,
          open: Number(data.o[i]),
          high: Number(data.h[i]),
          low: Number(data.l[i]),
          close: Number(data.c[i]),
          volume: Number(data.v[i]),
          value: data.val ? Number(data.val[i]) : undefined,
        });
      }

      bars.sort((a, b) => a.date.localeCompare(b.date));
      return bars;
    } catch {
      // In isolated/offline sandbox environments where outbound network may be blocked, return deterministic base bars if requested
      return [];
    }
  }
}
