import { describe, it, expect } from 'vitest';
import { StrategyFactory } from '../StrategyFactory.ts';
import { UniversalSignalNormalizer } from '../UniversalSignalNormalizer.ts';
import {
  makeMarketSnapshot,
  makeDerivativesSnapshot,
  makeEtfSnapshot,
  makeCorporateActionSnapshot,
  makeEarningsSnapshot,
} from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — Strategy Fail-Closed Matrix', () => {
  const baseContext: StrategyContext = {
    symbol: 'HPG',
    assetClass: 'EQUITY',
    asOfDate: '2026-10-01',
    evaluatedAt: '2026-10-01T15:00:00.000Z',
    currentPrice: 28000,
  };

  it('fails closed when market snapshot is missing for RegimeAdaptiveStrategy', () => {
    const signal = StrategyFactory.evaluate('REGIME_ADAPTIVE', {
      ...baseContext,
      assetClass: 'CROSS_ASSET',
      marketSnapshot: null,
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('MARKET_REGIME_UNAVAILABLE');
  });

  it('fails closed when derivatives snapshot is missing for FuturesBasisArbitrageStrategy', () => {
    const signal = StrategyFactory.evaluate('FUTURES_BASIS_ARBITRAGE', {
      ...baseContext,
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      derivativesSnapshot: null,
    });
    expect(signal.direction).toBe('FLAT');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('SPOT_INDEX_UNAVAILABLE');
  });

  it('fails closed when ETF snapshot is missing for EtfNavArbitrageStrategy', () => {
    const signal = StrategyFactory.evaluate('ETF_NAV_ARBITRAGE', {
      ...baseContext,
      symbol: 'E1VFVN30',
      assetClass: 'ETF',
      etfSnapshot: null,
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('ETF_NAV_UNAVAILABLE');
  });

  it('fails closed when corporate action snapshot is missing for DividendCaptureStrategy', () => {
    const signal = StrategyFactory.evaluate('DIVIDEND_CAPTURE', {
      ...baseContext,
      corporateActionSnapshot: null,
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('CORPORATE_ACTIONS_UNAVAILABLE');
  });

  it('fails closed when earnings snapshot is missing for EarningsMomentumStrategy', () => {
    const signal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', {
      ...baseContext,
      earningsSnapshot: null,
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('REQUIRED_EARNINGS_FACTS_UNAVAILABLE');
  });

  it('fails closed with LOOKAHEAD_DATA_REJECTED when lookahead is flagged', () => {
    const signal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', {
      ...baseContext,
      lookaheadRejected: true,
      lookaheadDetails: ['Future earnings reported on 2026-10-15'],
      earningsSnapshot: makeEarningsSnapshot(),
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('LOOKAHEAD_DATA_REJECTED');
  });

  it('fails closed when upstream snapshot dataFreshness is UNAVAILABLE', () => {
    const staleEarnings = makeEarningsSnapshot({ dataFreshness: 'UNAVAILABLE' });
    const signal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', {
      ...baseContext,
      earningsSnapshot: staleEarnings,
    });
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('REQUIRED_EARNINGS_FACTS_UNAVAILABLE');
  });

  it('clamps and neutralizes NaN and Infinity parameters and convictions', () => {
    expect(UniversalSignalNormalizer.normalizeConviction(NaN)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(Infinity)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(-Infinity)).toBe(0);
    expect(UniversalSignalNormalizer.normalizePrice(NaN)).toBeNull();
    expect(UniversalSignalNormalizer.normalizePrice(Infinity)).toBeNull();
  });

  it('fails closed on unknown strategy ID', () => {
    const signal = StrategyFactory.evaluate('FAKE_UNKNOWN_ID', baseContext);
    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('INVALID_STRATEGY_ID');
  });
});
