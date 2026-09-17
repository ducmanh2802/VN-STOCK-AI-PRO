/**
 * PHASE 20 — GENERATIVE PROPERTY-BASED TESTING SUITE
 * ===================================================
 * Deterministic quantitative invariants validation for Market Intelligence Foundation:
 *   - PBT-MI-01: Breadth Count Conservation (advances + declines + unchanged <= validConstituents <= total)
 *   - PBT-MI-02: Bounded Percentage Invariants (0.0 <= ratio <= 1.0, coverage, breadth thrust, participation)
 *   - PBT-MI-03: Relative Strength Mathematical Invariant (excessReturn == assetReturn - benchmarkReturn)
 *   - PBT-MI-04: Finite Numeric Guarantee (Strictly 0 NaN, Infinity, or unhandled nulls)
 *   - PBT-MI-05: Metamorphic Transformation & Pure Calculation Determinism
 *
 * Guaranteed 100% deterministic using SeededRng with zero external dependencies.
 */

import { describe, it, expect } from 'vitest';
import { SeededRng } from '../../../trading/replay/__tests__/harness/deterministicRng.ts';
import { MarketBreadthEngine } from '../MarketBreadthEngine.ts';
import { RelativeStrengthEngine } from '../RelativeStrengthEngine.ts';
import { SectorIntelligenceEngine } from '../SectorIntelligenceEngine.ts';
import { VolumeFlowIntelligenceEngine } from '../VolumeFlowIntelligenceEngine.ts';
import { MarketRegimeEngine } from '../MarketRegimeEngine.ts';
import { MarketIntelligenceSnapshotBuilder } from '../MarketIntelligenceSnapshotBuilder.ts';
import type { ConstituentCandleData } from '../types.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function generateRandomCandles(
  rng: SeededRng,
  length: number,
  basePrice: number,
  baseVol: number
): CandlePoint[] {
  const candles: CandlePoint[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < length; i++) {
    const changePct = -0.07 + rng.nextFloat() * 0.14; // HOSE +/-7%
    const open = currentPrice;
    currentPrice = Math.max(Number((currentPrice * (1 + changePct)).toFixed(2)), 1.0);
    const high = Math.max(open, currentPrice, Number((open * (1 + rng.nextFloat() * 0.02)).toFixed(2)));
    const low = Math.min(open, currentPrice, Number((open * (1 - rng.nextFloat() * 0.02)).toFixed(2)));
    const volume = Math.max(Math.round(baseVol * (0.3 + rng.nextFloat() * 2.7)), 100);

    candles.push({
      time: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open,
      high,
      low,
      close: currentPrice,
      volume,
    });
  }

  return candles;
}

describe('Phase 20 Property-Based Testing (Quantitative Invariants)', () => {
  it('PBT-MI-01: Breadth Count Conservation Law (100 generated universes)', () => {
    const rng = new SeededRng(20010100);

    for (let testCase = 0; testCase < 100; testCase++) {
      const universeSize = rng.nextInt(0, 30);
      const constituents: ConstituentCandleData[] = [];

      for (let i = 0; i < universeSize; i++) {
        const barCount = rng.nextInt(0, 60);
        const symbol = `SYM_${i}`;
        const candles = barCount > 0 ? generateRandomCandles(rng, barCount, 20 + i, 10000) : [];
        constituents.push({ symbol, candles });
      }

      const breadth = MarketBreadthEngine.evaluate(constituents);

      expect(breadth.totalConstituents).toBe(universeSize);
      expect(breadth.validConstituents).toBeLessThanOrEqual(universeSize);
      expect(
        breadth.advanceCount + breadth.declineCount + breadth.unchangedCount
      ).toBeLessThanOrEqual(breadth.validConstituents);
      expect(breadth.coverageRatio).toBeGreaterThanOrEqual(0.0);
      expect(breadth.coverageRatio).toBeLessThanOrEqual(1.0);
    }
  });

  it('PBT-MI-02: Bounded Percentage & Ratio Invariants (100 generated states)', () => {
    const rng = new SeededRng(20020100);

    for (let testCase = 0; testCase < 100; testCase++) {
      const universeSize = rng.nextInt(5, 20);
      const constituents: ConstituentCandleData[] = [];

      for (let i = 0; i < universeSize; i++) {
        const barCount = rng.nextInt(10, 60);
        const symbol = `SYM_${i}`;
        constituents.push({
          symbol,
          candles: generateRandomCandles(rng, barCount, 50, 50000),
        });
      }

      const breadth = MarketBreadthEngine.evaluate(constituents);

      if (breadth.percentAboveMA20 !== null) {
        expect(breadth.percentAboveMA20).toBeGreaterThanOrEqual(0.0);
        expect(breadth.percentAboveMA20).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(breadth.percentAboveMA20)).toBe(true);
      }
      if (breadth.percentAboveMA50 !== null) {
        expect(breadth.percentAboveMA50).toBeGreaterThanOrEqual(0.0);
        expect(breadth.percentAboveMA50).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(breadth.percentAboveMA50)).toBe(true);
      }
      if (breadth.breadthThrust !== null) {
        expect(breadth.breadthThrust).toBeGreaterThanOrEqual(0.0);
        expect(breadth.breadthThrust).toBeLessThanOrEqual(1.0);
      }
      if (breadth.marketParticipation !== null) {
        expect(breadth.marketParticipation).toBeGreaterThanOrEqual(0.0);
        expect(breadth.marketParticipation).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('PBT-MI-03: Relative Strength Mathematical Invariant (100 generated comparisons)', () => {
    const rng = new SeededRng(20030100);

    for (let testCase = 0; testCase < 100; testCase++) {
      const barCount = rng.nextInt(10, 150);
      const assetCandles = generateRandomCandles(rng, barCount, 25, 20000);
      const bmkCandles = generateRandomCandles(rng, barCount, 1250, 500000);

      const rs = RelativeStrengthEngine.evaluate({
        symbol: 'HPG',
        assetCandles,
        benchmarkCandles: bmkCandles,
      });

      for (const p of (['1W', '1M', '3M', '6M'] as const)) {
        const periodData = rs.periods[p];
        if (periodData.assetReturn !== null && periodData.benchmarkReturn !== null) {
          const expectedDiff = Number(
            (periodData.assetReturn - periodData.benchmarkReturn).toFixed(2)
          );
          expect(periodData.excessReturn).toBe(expectedDiff);
          expect(periodData.rsScore).toBeGreaterThanOrEqual(0);
          expect(periodData.rsScore).toBeLessThanOrEqual(100);
        } else {
          expect(periodData.excessReturn).toBeNull();
          expect(periodData.rsScore).toBeNull();
        }
      }

      if (rs.overallRS !== null) {
        expect(rs.overallRS).toBeGreaterThanOrEqual(0);
        expect(rs.overallRS).toBeLessThanOrEqual(100);
      }
    }
  });

  it('PBT-MI-04: Volume & Flow Finite Numeric Guarantee (100 generated assets)', () => {
    const rng = new SeededRng(20040100);

    for (let testCase = 0; testCase < 100; testCase++) {
      const barCount = rng.nextInt(5, 50);
      const candles = generateRandomCandles(rng, barCount, 30, 15000);

      const vf = VolumeFlowIntelligenceEngine.evaluate({
        symbol: 'TCB',
        candles,
      });

      expect(Number.isFinite(vf.currentVolume)).toBe(true);
      if (vf.volumeSMA20 !== null) expect(Number.isFinite(vf.volumeSMA20)).toBe(true);
      if (vf.relativeVolume !== null) expect(Number.isFinite(vf.relativeVolume)).toBe(true);
      if (vf.obv !== null) expect(Number.isFinite(vf.obv)).toBe(true);
      if (vf.accumulationDistribution !== null) {
        expect(Number.isFinite(vf.accumulationDistribution)).toBe(true);
      }
      expect(typeof vf.volumeSpike).toBe('boolean');
      expect(typeof vf.volumeDryUp).toBe('boolean');
    }
  });

  it('PBT-MI-05: Snapshot Metamorphic Invariance & Calculation Determinism (50 generated full snapshots)', () => {
    const rng = new SeededRng(20050100);

    for (let testCase = 0; testCase < 50; testCase++) {
      const indexCandles = generateRandomCandles(rng, 60, 1200, 1000000);
      const constituents: ConstituentCandleData[] = [
        { symbol: 'HPG', sectorId: 'materials', candles: generateRandomCandles(rng, 60, 25, 50000) },
        { symbol: 'FPT', sectorId: 'technology', candles: generateRandomCandles(rng, 60, 100, 30000) },
        { symbol: 'VCB', sectorId: 'banking', candles: generateRandomCandles(rng, 60, 90, 40000) },
      ];

      const snapshotA = MarketIntelligenceSnapshotBuilder.build({
        indexCandles,
        constituents,
        asOf: '2025-01-01T00:00:00.000Z',
      });

      const jsonA = JSON.stringify(snapshotA);
      expect(jsonA.includes('NaN')).toBe(false);
      expect(jsonA.includes('Infinity')).toBe(false);

      // Metamorphic check: Repeated evaluation with identical inputs produces identical JSON
      const snapshotB = MarketIntelligenceSnapshotBuilder.build({
        indexCandles,
        constituents,
        asOf: '2025-01-01T00:00:00.000Z',
      });
      const jsonB = JSON.stringify(snapshotB);

      expect(jsonB).toBe(jsonA);
    }
  });
});
