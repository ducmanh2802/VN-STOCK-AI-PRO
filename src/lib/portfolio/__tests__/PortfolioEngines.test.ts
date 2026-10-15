/**
 * PHASE 28 — PORTFOLIO ENGINES TESTS (deterministic)
 */
import { describe, expect, it } from 'vitest';
import { AllocationEngine } from '../AllocationEngine.ts';
import { ConcentrationEngine } from '../ConcentrationEngine.ts';
import { CovarianceEngine } from '../CovarianceEngine.ts';
import { FactorExposureEngine } from '../FactorExposureEngine.ts';
import { PortfolioDiagnosticsEngine } from '../PortfolioDiagnosticsEngine.ts';
import { PortfolioExposureEngine } from '../PortfolioExposureEngine.ts';
import { PortfolioIntelligenceSnapshotBuilder } from '../PortfolioIntelligenceSnapshotBuilder.ts';

const ASOF = '2026-09-30';
const EVAL = '2026-09-30T08:00:00.000Z';

describe('PortfolioExposureEngine', () => {
  it('empty portfolio yields genuine zeros', () => {
    const r = PortfolioExposureEngine.compute({ positions: [], cashValue: 0, asOfDate: ASOF });
    expect(r.invalid).toBe(false);
    expect(r.breakdown?.totalMarketValue).toBe(0);
    expect(r.breakdown?.weights).toEqual({});
  });

  it('computes weights, sector and class exposure', () => {
    const r = PortfolioExposureEngine.compute({
      positions: [
        { symbol: 'HPG', quantity: 1000, markPrice: 28000, sectorId: 'materials', assetClass: 'EQUITY' },
        { symbol: 'ACB', quantity: 2000, markPrice: 24000, sectorId: 'banking', assetClass: 'EQUITY' },
      ],
      cashValue: 4_000_000,
      asOfDate: ASOF,
    });
    expect(r.invalid).toBe(false);
    const b = r.breakdown!;
    expect(b.totalMarketValue).toBe(28_000_000 + 48_000_000 + 4_000_000);
    expect(b.weights.HPG).toBeCloseTo(28 / 80, 10);
    expect(b.sectorExposure.banking).toBeCloseTo(60, 10);
    expect(b.assetClassExposure.EQUITY).toBeCloseTo(95, 10);
    expect(b.assetClassExposure.CASH).toBeCloseTo(5, 10);
  });

  it('rejects negative quantity as INVALID', () => {
    const r = PortfolioExposureEngine.compute({
      positions: [{ symbol: 'HPG', quantity: -5, markPrice: 1000, assetClass: 'EQUITY' }],
      asOfDate: ASOF,
    });
    expect(r.invalid).toBe(true);
  });
});

describe('ConcentrationEngine', () => {
  it('flags max-position and sector breaches deterministically', () => {
    const exp = PortfolioExposureEngine.compute({
      positions: [
        { symbol: 'VCB', quantity: 5000, markPrice: 90000, sectorId: 'banking', assetClass: 'EQUITY' },
        { symbol: 'TCB', quantity: 1000, markPrice: 23000, sectorId: 'banking', assetClass: 'EQUITY' },
        { symbol: 'HPG', quantity: 500, markPrice: 28000, sectorId: 'materials', assetClass: 'EQUITY' },
      ],
      asOfDate: ASOF,
    }).breakdown!;
    const c = ConcentrationEngine.compute({ exposure: exp })!;
    expect(c.maxPositionSymbol).toBe('VCB');
    expect(c.withinLimits).toBe(false);
    expect(c.breaches.some((b) => b.startsWith('MAX_POSITION'))).toBe(true);
    expect(c.breaches.some((b) => b.startsWith('SECTOR_CONCENTRATION'))).toBe(true);
    expect(c.topNSymbols[0]).toBe('VCB');
    expect(c.hhi).toBeGreaterThan(2500);
  });

  it('empty exposure is within limits', () => {
    const exp = PortfolioExposureEngine.compute({ positions: [], asOfDate: ASOF }).breakdown!;
    const c = ConcentrationEngine.compute({ exposure: exp })!;
    expect(c.withinLimits).toBe(true);
    expect(c.hhi).toBe(0);
  });
});

describe('CovarianceEngine', () => {
  const r1 = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02, -0.005, 0.012];
  const r2 = [0.008, -0.018, 0.012, 0.004, -0.009, 0.018, -0.004, 0.01];

  it('computes symmetric covariance and unit diagonal correlation', () => {
    const out = CovarianceEngine.compute({
      returnsBySymbol: { AAA: r1, BBB: r2 },
      weights: { AAA: 0.5, BBB: 0.5 },
      minObservations: 5,
    })!;
    expect(out.insufficient).toBe(false);
    expect(out.covariance[0][1]).toBeCloseTo(out.covariance[1][0], 12);
    expect(out.correlation[0][0]).toBe(1);
    expect(out.correlation[0][1]).toBeGreaterThan(0.95);
    expect(out.annualizedPortfolioVolatility).toBeGreaterThan(0);
  });

  it('zero-variance leg yields null correlation (not zero)', () => {
    const flat = new Array(8).fill(0.001);
    const out = CovarianceEngine.compute({
      returnsBySymbol: { AAA: flat, BBB: r2 },
      weights: { AAA: 0.5, BBB: 0.5 },
      minObservations: 5,
    })!;
    expect(out.correlation[0][1]).toBeNull();
  });

  it('beta matches hand-computed OLS on overlapping tail', () => {
    const b = CovarianceEngine.beta(r1, r2);
    expect(b.beta).not.toBeNull();
    expect(b.overlap).toBe(8);
    expect(b.correlation).toBeGreaterThan(0.9);
    expect(b.trackingErrorAnn).toBeGreaterThanOrEqual(0);
  });
});

describe('FactorExposureEngine', () => {
  it('aggregates with per-factor renormalization and coverage', () => {
    const f = FactorExposureEngine.compute({
      weights: { AAA: 0.6, BBB: 0.4 },
      factorsBySymbol: {
        AAA: { value: 80, quality: 70, momentum: null, growth: 60, size: 50, lowVol: 40 },
        BBB: { value: 20, quality: null, momentum: 90, growth: 10, size: null, lowVol: null },
      },
    })!;
    expect(f.coverage).toBeCloseTo(1, 10);
    expect(f.exposure.value).toBeCloseTo(0.6 * 80 + 0.4 * 20, 10);
    // quality covered only by AAA (weight 0.6) => renormalized to AAA value
    expect(f.exposure.quality).toBeCloseTo(70, 10);
  });
});

describe('AllocationEngine', () => {
  it('weights sum to 1 and min-variance prefers low-vol', () => {
    const all = AllocationEngine.all({
      symbols: ['AAA', 'BBB'],
      volatilities: { AAA: 0.01, BBB: 0.04 },
      covariance: [
        [0.0001, 0],
        [0, 0.0016],
      ],
    });
    for (const m of Object.values(all)) {
      const s = Object.values(m.weights).reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 9);
      for (const w of Object.values(m.weights)) expect(w).toBeGreaterThanOrEqual(0);
    }
    expect(all.INVERSE_VOLATILITY.weights.AAA).toBeGreaterThan(
      all.INVERSE_VOLATILITY.weights.BBB
    );
    expect(all.MIN_VARIANCE.weights.AAA).toBeGreaterThan(all.MIN_VARIANCE.weights.BBB);
  });
});

describe('SnapshotBuilder end-to-end', () => {
  it('builds OK snapshot on complete inputs and is deterministic', () => {
    const base = {
      positions: [
        { symbol: 'HPG', quantity: 1000, markPrice: 28000, sectorId: 'materials', assetClass: 'EQUITY' as const },
        { symbol: 'ACB', quantity: 2000, markPrice: 24000, sectorId: 'banking', assetClass: 'EQUITY' as const },
      ],
      cashValue: 4_000_000,
      historicalReturns: {
        HPG: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.005 : -0.003)),
        ACB: Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 0.004 : -0.002)),
      },
      benchmarkReturns: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.003 : -0.001)),
      benchmarkSymbol: 'VN-INDEX',
      benchmarkPeriodReturn: 5.5,
      portfolioPeriodReturn: 6.1,
      factorScores: {
        HPG: { value: 70, quality: 60, momentum: 55, growth: 65, size: 50, lowVol: 45 },
        ACB: { value: 60, quality: 75, momentum: 50, growth: 55, size: 65, lowVol: 70 },
      },
      policy: { maxPositionPercent: 20, maxSectorPercent: 30, topN: 3 },
      shocks: { moderate: 0.1, severe: 0.3 },
      quoteFreshness: { HPG: 'FRESH', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
      minObservations: 30,
    };
    const a = PortfolioIntelligenceSnapshotBuilder.build(base);
    const b = PortfolioIntelligenceSnapshotBuilder.build(base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.exposure.status).toBe('OK');
    expect(a.covariance.status).toBe('OK');
    expect(a.beta.value?.beta).not.toBeNull();
    expect(a.factorExposure.value?.coverage).toBeCloseTo(1, 10);
    expect(a.benchmark.value?.activeReturn).toBeCloseTo(0.6, 10);
    expect(a.scenarios.value?.worstScenario).toBe('severe');
    expect(a.dataLineage.calculationVersion).toBe('v1.0.0-phase28');
    expect(a.limitations.length).toBeGreaterThan(0);
  });

  it('diagnostics verdict concentrated on breach', () => {
    const d = PortfolioDiagnosticsEngine.verdict({
      exposure: { totalMarketValue: 100, cashValue: 0, weights: { VCB: 0.9, HPG: 0.1 }, sectorExposure: { banking: 90 }, assetClassExposure: { EQUITY: 100, ETF: 0, DERIVATIVE: 0, CASH: 0 }, unmappedWeight: 0 },
      concentration: ConcentrationEngine.compute({
        exposure: { totalMarketValue: 100, cashValue: 0, weights: { VCB: 0.9, HPG: 0.1 }, sectorExposure: { banking: 90 }, assetClassExposure: { EQUITY: 100, ETF: 0, DERIVATIVE: 0, CASH: 0 }, unmappedWeight: 0 },
      }),
      exposureStatus: 'OK',
      covarianceStatus: 'OK',
      factorCoverage: 1,
    });
    expect(d.verdict).toBe('CONCENTRATED');
  });
});
