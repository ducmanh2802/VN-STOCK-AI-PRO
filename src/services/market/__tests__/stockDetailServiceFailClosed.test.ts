import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFullStockDetail } from '../stockDetailService';
import { vpsMarketDataProvider } from '../providers/VPSMarketDataProvider';
import { KbsHistoricalProvider } from '../providers/kbs/KbsHistoricalProvider';
import { realMarketDataProvider } from '../RealMarketDataProvider';

describe('PR-01A stockDetailService Fail-Closed Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when base quote is unavailable or non-positive', async () => {
    vi.spyOn(realMarketDataProvider, 'getStockDetail').mockResolvedValue(null);
    const result = await getFullStockDetail('VNM');
    expect(result).toBeNull();
  });

  it('returns null when fundamentals are unavailable from VPS (fail-closed, no synthetic fallback)', async () => {
    vi.spyOn(realMarketDataProvider, 'getStockDetail').mockResolvedValue({
      symbol: 'VNM',
      companyName: 'Vinamilk',
      exchange: 'HOSE',
      sector: 'Thực phẩm',
      price: 70000,
      change: 500,
      changePercent: 0.72,
      volume: 1000000,
      tradingValue: 70,
      open: 69500,
      high: 70500,
      low: 69500,
      refPrice: 69500,
      ceilingPrice: 74300,
      floorPrice: 64700,
      marketCap: 146000,
      pe: 15,
      pb: 4,
      roe: 25,
      rsi: 55,
      trend: 'UPTREND',
      aiScore: 70,
      fairValue: 80000,
      sparkline: [70000],
    });

    vi.spyOn(vpsMarketDataProvider, 'getFundamentals').mockRejectedValue(
      new Error('DATA_UNAVAILABLE: [VPS] Không có dữ liệu tài chính cho mã VNM')
    );

    const result = await getFullStockDetail('VNM');
    expect(result).toBeNull();
  });

  it('returns null when historical bars are unavailable from KBS (fail-closed, no price-derived 52-week)', async () => {
    vi.spyOn(realMarketDataProvider, 'getStockDetail').mockResolvedValue({
      symbol: 'VNM',
      companyName: 'Vinamilk',
      exchange: 'HOSE',
      sector: 'Thực phẩm',
      price: 70000,
      change: 500,
      changePercent: 0.72,
      volume: 1000000,
      tradingValue: 70,
      open: 69500,
      high: 70500,
      low: 69500,
      refPrice: 69500,
      ceilingPrice: 74300,
      floorPrice: 64700,
      marketCap: 146000,
      pe: 15,
      pb: 4,
      roe: 25,
      rsi: 55,
      trend: 'UPTREND',
      aiScore: 70,
      fairValue: 80000,
      sparkline: [70000],
    });

    vi.spyOn(vpsMarketDataProvider, 'getFundamentals').mockResolvedValue({
      symbol: 'VNM',
      dataSource: 'VPS',
      dataStatus: 'OK',
      fetchedAt: new Date().toISOString(),
      metrics: {
        pe: 17.5,
        pb: 4.2,
        eps: 4000,
        roe: 24.1,
        roa: 15.3,
        dividendYield: 5.5,
        debtToEquity: 0.35,
        revenueGrowthYoY: 8.5,
        profitGrowthYoY: 10.2,
        netMargin: 18.0,
        grossMargin: 42.0,
        sharesOutstanding: 2089,
        marketCapBillion: 146230,
      },
    });

    vi.spyOn(KbsHistoricalProvider, 'getDailyHistory').mockRejectedValue(
      new Error('DATA_UNAVAILABLE: KBS historical unreachable')
    );

    const result = await getFullStockDetail('VNM');
    expect(result).toBeNull();
  });

  it('preserves valid real fundamentals and historical bars without synthetic defaults', async () => {
    vi.spyOn(realMarketDataProvider, 'getStockDetail').mockResolvedValue({
      symbol: 'VNM',
      companyName: 'Vinamilk',
      exchange: 'HOSE',
      sector: 'Thực phẩm',
      price: 70000,
      change: 500,
      changePercent: 0.72,
      volume: 1000000,
      tradingValue: 70,
      open: 69500,
      high: 70500,
      low: 69500,
      refPrice: 69500,
      ceilingPrice: 74300,
      floorPrice: 64700,
      marketCap: 146000,
      pe: 15,
      pb: 4,
      roe: 25,
      rsi: 55,
      trend: 'UPTREND',
      aiScore: 70,
      fairValue: 80000,
      sparkline: [70000],
    });

    vi.spyOn(vpsMarketDataProvider, 'getFundamentals').mockResolvedValue({
      symbol: 'VNM',
      dataSource: 'VPS',
      dataStatus: 'OK',
      fetchedAt: new Date().toISOString(),
      metrics: {
        pe: 17.5,
        pb: 4.2,
        eps: 4000,
        roe: 24.1,
        roa: 15.3,
        dividendYield: 5.5,
        debtToEquity: 0.35,
        revenueGrowthYoY: 8.5,
        profitGrowthYoY: 10.2,
        netMargin: 18.0,
        grossMargin: 42.0,
        sharesOutstanding: 2089,
        marketCapBillion: 146230,
      },
    });

    const mockBars = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      open: 68000 + i * 100,
      high: 69000 + i * 100,
      low: 67500 + i * 100,
      close: 68500 + i * 100,
      volume: 1200000,
      value: (68500 + i * 100) * 1200000,
    }));

    vi.spyOn(KbsHistoricalProvider, 'getDailyHistory').mockResolvedValue(mockBars);

    const result = await getFullStockDetail('VNM');
    expect(result).not.toBeNull();
    // Verify real metrics are preserved from VPS
    expect(result!.fundamentals.pe).toBe(17.5);
    expect(result!.fundamentals.pb).toBe(4.2);
    expect(result!.fundamentals.eps).toBe(4000);
    expect(result!.fundamentals.roe).toBe(24.1);
    expect(result!.fundamentals.roa).toBe(15.3);

    // Verify 52-week values are derived strictly from real bars (not price * 1.25 / price * 0.75)
    expect(result!.high52Week).toBe(Math.max(...mockBars.map((b) => b.high)));
    expect(result!.low52Week).toBe(Math.min(...mockBars.map((b) => b.low)));
    expect(result!.high52Week).not.toBe(Math.round(70000 * 1.25));
    expect(result!.low52Week).not.toBe(Math.round(70000 * 0.75));
  });
});
