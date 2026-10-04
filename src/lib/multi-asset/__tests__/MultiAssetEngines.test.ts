/**
 * PHASE 29 — MULTI-ASSET ENGINES TESTS (deterministic)
 */
import { describe, expect, it } from 'vitest';
import { MultiAssetPortfolioEngine } from '../MultiAssetPortfolioEngine.ts';
import { MultiAssetPositionEngine } from '../MultiAssetPositionEngine.ts';
import { QuantPlatformIntegrationEngine } from '../QuantPlatformIntegrationEngine.ts';

const ASOF = '2026-09-30';
const EVAL = '2026-09-30T08:00:00.000Z';

describe('MultiAssetPositionEngine', () => {
  it('values equity/ETF/cash at qty x price', () => {
    const eq = MultiAssetPositionEngine.valueOne(
      { symbol: 'HPG', assetClass: 'EQUITY', quantity: 1000, markPrice: 28000 },
      ASOF
    );
    expect(eq.marketValue).toBe(28_000_000);
    const etf = MultiAssetPositionEngine.valueOne(
      { symbol: 'E1VFVN30', assetClass: 'ETF', quantity: 500, markPrice: 22000 },
      ASOF
    );
    expect(etf.marketValue).toBe(11_000_000);
    const cash = MultiAssetPositionEngine.valueOne(
      { symbol: 'CASH', assetClass: 'CASH', quantity: 5_000_000, markPrice: null },
      ASOF
    );
    expect(cash.marketValue).toBe(5_000_000);
  });

  it('values long/short futures notional with multiplier and requires margin+pnl', () => {
    const long = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 2, markPrice: 1500,
        marginPerContract: 30_000_000, unrealizedPnl: 5_000_000, expiryDate: '2026-10-16',
      },
      ASOF
    );
    expect(long.marketValue).toBe(2 * 1500 * 100_000);
    expect(long.marginRequired).toBe(60_000_000);
    expect(long.direction).toBe('LONG');
    const short = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: -1, markPrice: 1500,
        marginPerContract: 30_000_000, unrealizedPnl: -2_000_000, expiryDate: '2026-10-16',
      },
      ASOF
    );
    expect(short.marketValue).toBe(-1500 * 100_000);
    expect(short.direction).toBe('SHORT');
  });

  it('expired contract is INVALID', () => {
    const v = MultiAssetPositionEngine.valueOne(
      {
        symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500,
        marginPerContract: 1, unrealizedPnl: 0, expiryDate: '2026-09-01',
      },
      ASOF
    );
    expect(v.status).toBe('INVALID');
  });
});

describe('MultiAssetPortfolioEngine', () => {
  it('aggregates leverage and margin coverage', () => {
    const { valued } = MultiAssetPositionEngine.valueAll(
      [
        { symbol: 'HPG', assetClass: 'EQUITY', quantity: 1000, markPrice: 28000 },
        { symbol: 'VN30F1M', assetClass: 'DERIVATIVE', quantity: 1, markPrice: 1500, marginPerContract: 30_000_000, unrealizedPnl: 0, expiryDate: '2026-10-16' },
      ],
      ASOF
    );
    const { summary, status } = MultiAssetPortfolioEngine.summarize({ valued, cashBalance: 100_000_000 });
    expect(status).toBe('OK');
    // gross = 28M + 150M notional
    expect(summary.grossExposure).toBe(178_000_000);
    // netAssets = 28M securities + 100M cash + 0 pnl
    expect(summary.netAssets).toBe(128_000_000);
    expect(summary.leverage).toBeCloseTo(178 / 128, 10);
    expect(summary.totalMarginRequired).toBe(30_000_000);
    expect(summary.marginCoverage).toBeCloseTo(100 / 30, 10);
  });

  it('rebalance hints respect lot size', () => {
    const { valued } = MultiAssetPositionEngine.valueAll(
      [{ symbol: 'HPG', assetClass: 'EQUITY', quantity: 1000, markPrice: 28000 }],
      ASOF
    );
    const { summary } = MultiAssetPortfolioEngine.summarize({ valued, cashBalance: 72_000_000 });
    // net = 100M; target HPG 50% => delta +22M => 785 shares => hint 700 (lot 100)
    const deltas = MultiAssetPortfolioEngine.rebalance(valued, { HPG: 0.5 }, summary.netAssets, { HPG: 28000 })!;
    expect(deltas[0].deltaValue).toBeCloseTo(22_000_000, 6);
    expect(deltas[0].hintedQuantityDelta).toBe(700);
  });
});

describe('QuantPlatformIntegrationEngine', () => {
  it('builds deterministic snapshot and never overrides HOLD', () => {
    const req = {
      positions: [
        { symbol: 'HPG', assetClass: 'EQUITY' as const, quantity: 1000, markPrice: 28000 },
        { symbol: 'E1VFVN30', assetClass: 'ETF' as const, quantity: 500, markPrice: 22000 },
      ],
      cashBalance: 61_000_000,
      targetWeights: { HPG: 0.3, E1VFVN30: 0.2 },
      markPrices: { HPG: 28000, E1VFVN30: 22000 },
      signals: [
        { direction: 'LONG', conviction: 70 },
        { direction: 'HOLD', conviction: 0 },
      ],
      portfolioReference: 'portfolio-2026-09-30-2',
      leverageCap: 2,
      cashFloorPercent: 10,
      quoteFreshness: { HPG: 'FRESH', E1VFVN30: 'FRESH' } as never,
      asOfDate: ASOF,
      evaluatedAt: EVAL,
    };
    const a = QuantPlatformIntegrationEngine.build(req);
    const b = QuantPlatformIntegrationEngine.build(req);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.summary.netAssets).toBe(100_000_000);
    expect(a.strategy.total).toBe(2);
    expect(a.strategy.hasNonHoldSignal).toBe(true);
    expect(a.portfolioReference).toBe('portfolio-2026-09-30-2');
    expect(a.limits[0].passed).toBe(true);
    expect(a.dataLineage.calculationVersion).toBe('v1.0.0-phase29');
  });
});
