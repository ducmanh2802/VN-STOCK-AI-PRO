import { describe, it, expect } from 'vitest';
import { SectorIntelligenceEngine } from '../SectorIntelligenceEngine.ts';
import type { ConstituentCandleData } from '../types.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p,
    high: p * 1.02,
    low: p * 0.98,
    close: p,
    volume: 10000,
  }));
}

describe('SectorIntelligenceEngine', () => {
  it('groups known universe constituents into canonical sectors and ranks them', () => {
    // 30 bars of data
    const strongPrices = Array.from({ length: 30 }, (_, i) => 20 + i * 1.0); // +100% gain
    const weakPrices = Array.from({ length: 30 }, (_, i) => 50 - i * 0.8);   // -50% loss

    const constituents: ConstituentCandleData[] = [
      // HPG -> materials
      { symbol: 'HPG', candles: createMockCandles(strongPrices) },
      // FPT -> technology
      { symbol: 'FPT', candles: createMockCandles(strongPrices) },
      // VCB -> banking
      { symbol: 'VCB', candles: createMockCandles(weakPrices) },
    ];

    const result = SectorIntelligenceEngine.evaluate(constituents);

    expect(result.sectors.length).toBeGreaterThan(0);

    const materialsSector = result.sectors.find((s) => s.sectorId === 'materials');
    expect(materialsSector).toBeDefined();
    expect(materialsSector!.totalConstituents).toBeGreaterThan(0);
    expect(materialsSector!.returns.d1).toBeGreaterThan(0);

    // Ranks should be 1-based and strictly ascending
    const rankedSectors = result.sectors.filter((s) => s.rank !== null);
    for (let i = 0; i < rankedSectors.length; i++) {
      expect(rankedSectors[i].rank).toBe(i + 1);
    }
  });

  it('computes relative strength against benchmark series', () => {
    const assetPrices = [100, 105, 110, 115, 120, 130];
    const bmkPrices = [1000, 1005, 1010, 1015, 1020, 1025]; // +2.5% vs +30%

    const constituents: ConstituentCandleData[] = [
      { symbol: 'SSI', candles: createMockCandles(assetPrices) },
    ];

    const result = SectorIntelligenceEngine.evaluate(constituents, {
      benchmarkCandles: {
        vnIndex: createMockCandles(bmkPrices),
      },
    });

    const finSector = result.sectors.find((s) => s.sectorId === 'financial_services');
    expect(finSector).toBeDefined();
    expect(finSector!.relativeStrength.vsVnIndex.w1).toBeDefined();
  });
});
