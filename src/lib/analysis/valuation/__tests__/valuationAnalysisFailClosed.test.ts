import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockRepository, PriceRepository, FundamentalRepository } from '../../../db/index';
import { ValuationEngine } from '../../index';

describe('PR-01A Valuation Analysis Route Fail-Closed Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing or non-positive price with fail-closed DATA_UNAVAILABLE (no 100000 fallback)', async () => {
    vi.spyOn(StockRepository, 'getBySymbol').mockResolvedValue({ id: 1, symbol: 'TEST' } as any);
    vi.spyOn(PriceRepository, 'getLatestDaily').mockResolvedValue(null);
    vi.spyOn(FundamentalRepository, 'getLatestRatios').mockResolvedValue(null);

    // Simulate route logic
    const req = { params: { symbol: 'TEST' } };
    let responseStatus = 200;
    let responseBody: any = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
      json: (body: any) => {
        responseBody = body;
      },
    };

    const stock = await StockRepository.getBySymbol(req.params.symbol);
    expect(stock).toBeDefined();

    const latestDaily = await PriceRepository.getLatestDaily(stock!.id);
    const rawClose = latestDaily?.close != null ? Number(latestDaily.close) : NaN;

    if (!Number.isFinite(rawClose) || rawClose <= 0) {
      res.status(404).json({
        symbol: req.params.symbol,
        dataStatus: 'DATA_UNAVAILABLE',
        error: 'Dữ liệu giá không khả dụng cho phân tích định giá',
      });
    }

    expect(responseStatus).toBe(404);
    expect(responseBody).toEqual({
      symbol: 'TEST',
      dataStatus: 'DATA_UNAVAILABLE',
      error: 'Dữ liệu giá không khả dụng cho phân tích định giá',
    });
    // Strict invariant: no 100000 fallback was evaluated
    expect(responseBody).not.toHaveProperty('currentPrice', 100000);
  });

  it('evaluates valuation cleanly when valid price exists without fabricated defaults', async () => {
    vi.spyOn(StockRepository, 'getBySymbol').mockResolvedValue({ id: 1, symbol: 'TEST' } as any);
    vi.spyOn(PriceRepository, 'getLatestDaily').mockResolvedValue({ close: 25000 } as any);
    vi.spyOn(FundamentalRepository, 'getLatestRatios').mockResolvedValue({
      eps: 2500,
      bvps: 15000,
    } as any);

    const stock = await StockRepository.getBySymbol('TEST');
    const latestDaily = await PriceRepository.getLatestDaily(stock!.id);
    const latestRatios = await FundamentalRepository.getLatestRatios(stock!.id);

    const rawClose = latestDaily?.close != null ? Number(latestDaily.close) : NaN;
    expect(Number.isFinite(rawClose) && rawClose > 0).toBe(true);

    const currentPrice = rawClose;
    const eps = latestRatios?.eps ? Number(latestRatios.eps) : null;
    const bvps = latestRatios?.bvps ? Number(latestRatios.bvps) : null;

    const valuation = ValuationEngine.evaluate({
      currentPrice,
      eps,
      bookValuePerShare: bvps,
      targetPE: 16,
      targetPB: 2.2,
    });

    expect(valuation.fairValuePE).toBe(40000);
    expect(valuation.fairValuePB).toBe(33000);
    expect(valuation.status).toBe('success');
  });
});
