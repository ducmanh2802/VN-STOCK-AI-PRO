import { describe, it, expect } from 'vitest';
import { EtfHoldingsEngine } from '../EtfHoldingsEngine.ts';

describe('Phase 22.4 — ETF Holdings & Basket Engine', () => {
  it('computes constituent weights, cash drag, and concentration metrics accurately', () => {
    const rawConstituents = [
      {
        symbol: 'HPG',
        companyName: 'Hoa Phat Group',
        sharesInBasket: 10_000,
        marketPrice: 30_000, // 300M
        sectorId: 'materials',
        benchmarkWeightPercent: 28.0,
      },
      {
        symbol: 'FPT',
        companyName: 'FPT Corp',
        sharesInBasket: 4_000,
        marketPrice: 125_000, // 500M
        sectorId: 'technology',
        benchmarkWeightPercent: 52.0,
      },
      {
        symbol: 'VNM',
        companyName: 'Vinamilk',
        sharesInBasket: 2_000,
        marketPrice: 80_000, // 160M
        sectorId: 'consumer_staples',
        benchmarkWeightPercent: 18.0,
      },
    ];

    // Total equity = 960M
    // Cash = 40M
    // Total basket = 1,000M (1B VND)
    // HPG weight = 300M / 1000M = 30% (vs bench 28% -> diff +2%)
    // FPT weight = 500M / 1000M = 50% (vs bench 52% -> diff -2%)
    // VNM weight = 160M / 1000M = 16% (vs bench 18% -> diff -2%)
    // Cash weight = 40M / 1000M = 4%
    // Top 5 concentration = 50 + 30 + 16 = 96%

    const res = EtfHoldingsEngine.analyze({
      symbol: 'E1VFVN30',
      asOfDate: '2026-09-30',
      constituents: rawConstituents,
      cashComponentVnd: 40_000_000,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.totalConstituents).toBe(3);
    expect(res.totalBasketValueVnd).toBe(1_000_000_000);
    expect(res.cashWeightPercent).toBe(4.0);
    expect(res.top5ConcentrationPercent).toBe(96.0);

    const hpg = res.constituents.find((c) => c.symbol === 'HPG');
    expect(hpg?.weightPercent).toBe(30.0);
    expect(hpg?.weightDifference).toBe(2.0);

    const fpt = res.constituents.find((c) => c.symbol === 'FPT');
    expect(fpt?.weightPercent).toBe(50.0);
    expect(fpt?.weightDifference).toBe(-2.0);

    // Invariant: sum of weights + cashWeight equals 100%
    const totalWeights = res.constituents.reduce((acc, c) => acc + (c.weightPercent ?? 0), 0);
    expect(totalWeights + res.cashWeightPercent!).toBeCloseTo(100.0, 1);

    // Sector breakdown
    expect(res.sectorBreakdown.materials).toBe(30.0);
    expect(res.sectorBreakdown.technology).toBe(50.0);
    expect(res.sectorBreakdown.consumer_staples).toBe(16.0);
  });

  it('fails closed when any constituent price is null or invalid', () => {
    const rawConstituents = [
      {
        symbol: 'HPG',
        companyName: 'Hoa Phat Group',
        sharesInBasket: 10_000,
        marketPrice: 30_000,
        sectorId: 'materials',
      },
      {
        symbol: 'FPT',
        companyName: 'FPT Corp',
        sharesInBasket: 4_000,
        marketPrice: null, // Missing!
        sectorId: 'technology',
      },
    ];

    const res = EtfHoldingsEngine.analyze({
      symbol: 'E1VFVN30',
      asOfDate: '2026-09-30',
      constituents: rawConstituents,
      cashComponentVnd: 10_000_000,
    });

    expect(res.status).toBe('DATA_UNAVAILABLE');
    expect(res.constituents).toEqual([]);
    expect(res.totalBasketValueVnd).toBeNull();
  });

  it('handles empty constituents list safely without throwing', () => {
    const res = EtfHoldingsEngine.analyze({
      symbol: 'E1VFVN30',
      asOfDate: '2026-09-30',
      constituents: [],
      cashComponentVnd: 0,
    });

    expect(res.status).toBe('DATA_UNAVAILABLE');
    expect(res.totalConstituents).toBe(0);
  });
});
