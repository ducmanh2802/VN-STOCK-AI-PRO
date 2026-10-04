/**
 * DECISION-04 TESTS — sizing wrapper: lot, multiplier passthrough, blocked, HOLD/FLAT
 */
import { describe, it, expect } from 'vitest';
import { PositionIntegrationEngine } from '../PositionIntegrationEngine.ts';

const BASE = {
  equity: 100000000, availableCash: 100000000, entryPrice: 20000, stopLossPrice: 19000,
  maxRiskPerTradeRate: 0.01, lotSize: 100, buyFeeRate: 0.0015, slippageRate: 0.001,
  existingExposure: 0, maxPortfolioExposureRate: 0.8, capitalCeiling: 1000000000,
};

describe('PositionIntegrationEngine', () => {
  it('sizes FULL via injected sizer (lot-rounded)', () => {
    const r = PositionIntegrationEngine.integrate(
      { ...BASE, strategyDirection: 'LONG', riskBlocked: false, dataUnavailable: false, portfolioLimitHit: false },
      () => ({ canTrade: true, quantity: 500, code: 'SUCCESS', reason: 'ok' })
    );
    expect(r.state).toBe('FULL');
    expect(r.quantity).toBe(500);
    expect(r.zeroReason).toBeNull();
  });

  it('preserves HOLD/FLAT as ZERO_BY_NO_SIGNAL without calling sizer', () => {
    let called = false;
    const r = PositionIntegrationEngine.integrate(
      { ...BASE, strategyDirection: 'HOLD', riskBlocked: false, dataUnavailable: false, portfolioLimitHit: false },
      () => { called = true; return { canTrade: true, quantity: 500, code: 'SUCCESS', reason: 'ok' }; }
    );
    expect(r.zeroReason).toBe('ZERO_BY_NO_SIGNAL');
    expect(called).toBe(false);
  });

  it('maps sizer codes to zero taxonomy (no generic zero)', () => {
    const cases = [
      ['EXCESSIVE_RISK', 'ZERO_BY_RISK'],
      ['INSUFFICIENT_CASH', 'ZERO_BY_PORTFOLIO_LIMIT'],
      ['INVALID_PRICE', 'ZERO_BY_DATA_UNAVAILABLE'],
    ] as const;
    for (const [code, reason] of cases) {
      const r = PositionIntegrationEngine.integrate(
        { ...BASE, strategyDirection: 'LONG', riskBlocked: false, dataUnavailable: false, portfolioLimitHit: false },
        () => ({ canTrade: false, quantity: 0, code, reason: code })
      );
      expect(r.zeroReason).toBe(reason);
    }
  });

  it('blocks on risk/data, zeroes on portfolio limit', () => {
    expect(
      PositionIntegrationEngine.integrate(
        { ...BASE, strategyDirection: 'LONG', riskBlocked: true, dataUnavailable: false, portfolioLimitHit: false },
        () => ({ canTrade: true, quantity: 100, code: 'SUCCESS', reason: 'ok' })
      ).zeroReason
    ).toBe('ZERO_BY_RISK');
    expect(
      PositionIntegrationEngine.integrate(
        { ...BASE, strategyDirection: 'LONG', riskBlocked: false, dataUnavailable: false, portfolioLimitHit: true },
        () => ({ canTrade: true, quantity: 100, code: 'SUCCESS', reason: 'ok' })
      ).zeroReason
    ).toBe('ZERO_BY_PORTFOLIO_LIMIT');
  });
});
