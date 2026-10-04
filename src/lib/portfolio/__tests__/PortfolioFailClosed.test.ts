/**
 * PHASE 28 — FAIL-CLOSED TESTS (no fabricated data, explicit statuses)
 */
import { describe, expect, it } from 'vitest';
import { PortfolioIntelligenceSnapshotBuilder } from '../PortfolioIntelligenceSnapshotBuilder.ts';

const ASOF = '2026-09-30';
const EVAL = '2026-09-30T08:00:00.000Z';

function basePositions() {
  return [
    { symbol: 'HPG', quantity: 1000, markPrice: 28000, sectorId: 'materials', assetClass: 'EQUITY' as const },
    { symbol: 'ACB', quantity: 2000, markPrice: 24000, sectorId: 'banking', assetClass: 'EQUITY' as const },
  ];
}

describe('Portfolio fail-closed', () => {
  it('missing historical series => covariance DATA_UNAVAILABLE, value null', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: basePositions(),
      historicalReturns: { HPG: [0.01, 0.02] },
      benchmarkReturns: [],
      factorScores: {},
      shocks: {},
      quoteFreshness: { HPG: 'FRESH', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.covariance.status).toBe('DATA_UNAVAILABLE');
    expect(s.covariance.value).toBeNull();
    expect(s.beta.value).toBeNull();
  });

  it('short series => INSUFFICIENT_DATA (never fabricated)', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: basePositions(),
      historicalReturns: { HPG: [0.01, -0.01, 0.02], ACB: [0.005, -0.005, 0.01] },
      benchmarkReturns: [0.001, 0.002, 0.003],
      factorScores: {},
      shocks: { severe: 0.3 },
      quoteFreshness: { HPG: 'FRESH', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
      minObservations: 30,
    });
    expect(s.covariance.status).toBe('INSUFFICIENT_DATA');
    expect(s.covariance.value?.observationCount).toBe(3);
  });

  it('stale quotes propagate STALE without fabricating values', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: basePositions(),
      historicalReturns: {
        HPG: new Array(35).fill(0.001),
        ACB: new Array(35).fill(0.002),
      },
      benchmarkReturns: new Array(35).fill(0.001),
      factorScores: {},
      shocks: {},
      quoteFreshness: { HPG: 'STALE', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.exposure.status).toBe('STALE');
    expect(s.dataFreshness).toBe('STALE');
  });

  it('unavailable quotes => DATA_UNAVAILABLE', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: basePositions(),
      historicalReturns: {},
      benchmarkReturns: [],
      factorScores: {},
      shocks: {},
      quoteFreshness: { HPG: 'UNAVAILABLE', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.exposure.status).toBe('DATA_UNAVAILABLE');
  });

  it('invalid inputs => INVALID (negative quantity)', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: [{ symbol: 'HPG', quantity: -10, markPrice: 1000, assetClass: 'EQUITY' as const }],
      historicalReturns: {},
      benchmarkReturns: [],
      factorScores: {},
      shocks: {},
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.exposure.status).toBe('INVALID');
    expect(s.dataFreshness).toBe('INVALID');
  });

  it('empty portfolio => genuine OK zeros, not missing data', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: [],
      historicalReturns: {},
      benchmarkReturns: [],
      factorScores: {},
      shocks: {},
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.exposure.value?.totalMarketValue).toBe(0);
    expect(s.diagnostics.verdict).toBe('EMPTY');
  });

  it('zero factor coverage => DATA_UNAVAILABLE with null exposure map', () => {
    const s = PortfolioIntelligenceSnapshotBuilder.build({
      positions: basePositions(),
      historicalReturns: {
        HPG: new Array(35).fill(0.001),
        ACB: new Array(35).fill(0.002),
      },
      benchmarkReturns: new Array(35).fill(0.001),
      factorScores: {},
      shocks: {},
      quoteFreshness: { HPG: 'FRESH', ACB: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    });
    expect(s.factorExposure.status).toBe('DATA_UNAVAILABLE');
    expect(s.factorExposure.value).toBeNull();
  });
});
