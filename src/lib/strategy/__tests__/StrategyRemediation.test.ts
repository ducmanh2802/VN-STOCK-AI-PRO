/**
 * PHASE 25 — REMEDIATION REGRESSION TESTS (P25-P1-1..P3-3)
 * =======================================================
 * Explicit evidence for every behavior change introduced during Phase 25
 * certification remediation. STALE inputs must never yield tradable signals.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyFactory } from '../StrategyFactory.ts';
import { UniversalSignalNormalizer } from '../UniversalSignalNormalizer.ts';
import {
  resolveDerivativesUnderlying,
  StrategyContextAggregator,
} from '../StrategyContextAggregator.ts';
import { StrategyIntelligenceService } from '../../../services/strategy/StrategyIntelligenceService.ts';
import { cacheClear } from '../../../services/market/marketDataCache.ts';
import {
  makeMarketSnapshot,
  makeDerivativesSnapshot,
  makeEtfSnapshot,
  makeCorporateActionSnapshot,
  makeEarningsSnapshot,
} from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

const baseContext: StrategyContext = {
  symbol: 'HPG',
  assetClass: 'EQUITY',
  asOfDate: '2026-10-01',
  evaluatedAt: '2026-10-01T15:00:00.000Z',
  currentPrice: 28000,
};

const lineageBase = {
  strategyId: 'TEST',
  strategyVersion: '25.0.0-TEST',
  engine: 'Test',
  evaluatedAt: '2026-10-01T15:00:00.000Z',
  asOfDate: '2026-10-01',
  assetClass: 'EQUITY' as const,
  sourceSnapshots: {},
};

describe('Phase 25 remediation — P1-1 STALE fail-closed matrix', () => {
  it('normalizer forces HOLD/FLAT + 0 + nulls on STALE (never tradable)', () => {
    const equity = UniversalSignalNormalizer.normalize({
      strategyId: 'T',
      assetClass: 'EQUITY',
      symbol: 'HPG',
      direction: 'LONG',
      conviction: 95,
      targetPrice: 30000,
      stopLoss: 25000,
      dataFreshness: 'STALE',
      lineage: lineageBase,
    });
    expect(equity.direction).toBe('HOLD');
    expect(equity.conviction).toBe(0);
    expect(equity.targetPrice).toBeNull();
    expect(equity.stopLoss).toBeNull();
    expect(equity.reasonCode).toBe('STALE_DATA_UNAVAILABLE');

    const deriv = UniversalSignalNormalizer.normalize({
      strategyId: 'T',
      assetClass: 'DERIVATIVE',
      symbol: 'VN30F1M',
      direction: 'SHORT',
      conviction: 88,
      dataFreshness: 'STALE',
      lineage: { ...lineageBase, assetClass: 'DERIVATIVE' as const },
    });
    expect(deriv.direction).toBe('FLAT');
    expect(deriv.conviction).toBe(0);
  });

  it('EarningsMomentum withholds on STALE earnings', () => {
    const signal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', {
      ...baseContext,
      earningsSnapshot: makeEarningsSnapshot({ dataFreshness: 'STALE' }),
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('EARNINGS_DATA_STALE');
    expect(signal.dataFreshness).toBe('STALE');
  });

  it('FuturesBasisArbitrage withholds on STALE derivatives', () => {
    const signal = StrategyFactory.evaluate('FUTURES_BASIS_ARBITRAGE', {
      ...baseContext,
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      derivativesSnapshot: makeDerivativesSnapshot({ dataFreshness: 'STALE' }),
    });
    expect(signal.direction).toBe('FLAT');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('DERIVATIVES_DATA_STALE');
  });

  it('EtfNavArbitrage withholds on STALE ETF snapshot', () => {
    const signal = StrategyFactory.evaluate('ETF_NAV_ARBITRAGE', {
      ...baseContext,
      symbol: 'E1VFVN30',
      assetClass: 'ETF',
      etfSnapshot: makeEtfSnapshot({ dataFreshness: 'STALE' }),
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('ETF_DATA_STALE');
  });

  it('DividendCapture withholds on STALE corporate actions', () => {
    const signal = StrategyFactory.evaluate('DIVIDEND_CAPTURE', {
      ...baseContext,
      corporateActionSnapshot: makeCorporateActionSnapshot({ dataFreshness: 'STALE' }),
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('CORPORATE_ACTIONS_STALE');
  });

  it('RegimeAdaptive withholds on STALE market snapshot', () => {
    const signal = StrategyFactory.evaluate('REGIME_ADAPTIVE', {
      ...baseContext,
      assetClass: 'CROSS_ASSET',
      marketSnapshot: makeMarketSnapshot({ dataFreshness: 'STALE' }),
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('MARKET_DATA_STALE');
  });
});

describe('Phase 25 remediation — P1-2 synthetic yield + P2/P3 defects', () => {
  it('P1-2: DividendCapture withholds (no fabricated yield) when price is missing', () => {
    const signal = StrategyFactory.evaluate('DIVIDEND_CAPTURE', {
      ...baseContext,
      currentPrice: null,
      corporateActionSnapshot: makeCorporateActionSnapshot(),
    });
    // In-window dividend fixtures would previously emit LONG on a /10_000 yield.
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.targetPrice).toBeNull();
    expect(signal.reasonCode).toBe('CURRENT_PRICE_UNAVAILABLE');
  });

  it('P2-1: VN100 futures resolve to the VN100 underlying (never VN30)', () => {
    expect(resolveDerivativesUnderlying('VN100F1M')).toBe('VN100');
    expect(resolveDerivativesUnderlying('vn100f2606')).toBe('VN100');
    expect(resolveDerivativesUnderlying('VN30F1M')).toBe('VN30');
    expect(resolveDerivativesUnderlying('VN30F2604')).toBe('VN30');
  });

  it('P2-2: factory refuses to overwrite canonical strategy IDs', () => {
    expect(() =>
      StrategyFactory.register({
        id: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
        name: 'hijack',
        description: 'hijack',
        assetClass: 'EQUITY',
        defaultParameters: {},
        validateParameters: () => ({ valid: true }),
        evaluate: () => {
          throw new Error('must never be installed');
        },
      })
    ).toThrow(/refusal to overwrite canonical/);
    // Canonical generator is untouched.
    expect(StrategyFactory.getStrategy('STRATEGY_EQUITY_EARNINGS_MOMENTUM')).toBe(
      StrategyFactory.getStrategy('EARNINGS_MOMENTUM_QUALITY')
    );
  });

  it('P2-2: factory still accepts genuinely custom strategies', () => {
    StrategyFactory.register({
      id: 'STRATEGY_TEST_CUSTOM_REMEDIATION',
      name: 'custom',
      description: 'custom',
      assetClass: 'EQUITY',
      defaultParameters: {},
      validateParameters: () => ({ valid: true }),
      evaluate: (ctx) =>
        UniversalSignalNormalizer.normalize({
          strategyId: 'STRATEGY_TEST_CUSTOM_REMEDIATION',
          assetClass: 'EQUITY',
          symbol: ctx.symbol,
          direction: 'HOLD',
          conviction: 0,
          dataFreshness: 'CURRENT',
          lineage: lineageBase,
        }),
    });
    expect(StrategyFactory.getStrategy('STRATEGY_TEST_CUSTOM_REMEDIATION')).toBeDefined();
  });

  it('P2-3: same-day intraday-future snapshot is lookahead-rejected', async () => {
    // DERIVATIVE + full override injection => zero live fetches (deterministic).
    const ctx = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T09:00:00.000Z',
      derivativesSnapshotOverride: makeDerivativesSnapshot({
        timestamp: '2026-10-01T15:00:00.000Z',
      }) as never,
    });
    expect(ctx.lookaheadRejected).toBe(true);
    expect(ctx.lookaheadDetails.length).toBeGreaterThan(0);
  });

  it('P2-3: same-instant snapshot is not lookahead-rejected', async () => {
    const ctx = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      derivativesSnapshotOverride: makeDerivativesSnapshot({
        timestamp: '2026-10-01T15:00:00.000Z',
      }) as never,
    });
    expect(ctx.lookaheadRejected).toBe(false);
  });

  it('P3-2: excessive tracking error yields zero-conviction HOLD', () => {
    const base = makeEtfSnapshot();
    const stressed = {
      ...base,
      tracking: base.tracking ? { ...base.tracking, trackingErrorAnnualized: 9.5 } : base.tracking,
    };
    const signal = StrategyFactory.evaluate('ETF_NAV_ARBITRAGE', {
      ...baseContext,
      symbol: 'E1VFVN30',
      assetClass: 'ETF',
      etfSnapshot: stressed,
    });
    expect(signal.reasonCode).toBe('EXCESSIVE_TRACKING_ERROR');
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
  });

  it('P3-3: fail-closed signals are never cached (healed feed recovers immediately)', async () => {
    cacheClear();
    const staleCtx: StrategyContext = {
      ...baseContext,
      earningsSnapshot: makeEarningsSnapshot({ dataFreshness: 'STALE' }),
    };
    const first = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'EARNINGS_MOMENTUM_QUALITY',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      contextOverride: staleCtx,
    });
    expect(first.reasonCode).toBe('EARNINGS_DATA_STALE');

    // Same key, healed snapshot, no forceRefresh: must NOT replay cached STALE.
    const healed = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'EARNINGS_MOMENTUM_QUALITY',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      contextOverride: { ...staleCtx, earningsSnapshot: makeEarningsSnapshot({ dataFreshness: 'CURRENT' }) },
    });
    expect(healed.reasonCode).not.toBe('EARNINGS_DATA_STALE');
    cacheClear();
  });
});
