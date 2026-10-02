import { describe, it, expect } from 'vitest';
import { DividendCaptureStrategy } from '../generators/DividendCaptureStrategy.ts';
import { makeCorporateActionSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — DividendCaptureStrategy', () => {
  const strategy = new DividendCaptureStrategy();

  it('validates parameters strictly', () => {
    expect(strategy.validateParameters({ minDividendYieldPercent: 4.0 }).valid).toBe(true);
    expect(strategy.validateParameters({ minDividendYieldPercent: -1 }).valid).toBe(false);
  });

  it('emits LONG signal when upcoming cash dividend meets yield and pre-ex-date threshold', () => {
    // Current price 28,000; cashAmount 1,500 -> Yield = 1500 / 28000 = 5.36% (>= 3.5%)
    // Ex-date is 2026-10-08, asOfDate is 2026-10-01 -> 7 days before ex-date (<= 15 days)
    const corp = makeCorporateActionSnapshot();

    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      corporateActionSnapshot: corp,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBeGreaterThanOrEqual(70);
    expect(signal.targetPrice).toBe(29500); // 28000 + 1500
    expect(signal.stopLoss).toBe(26600);    // 28000 * 0.95
    expect(signal.timeInForce).toBe('POSITION');
  });

  it('emits HOLD when announced dividend is outside the pre-ex-date window', () => {
    // Ex-date is 2026-12-01 (61 days away, > 15 days)
    const corp = makeCorporateActionSnapshot({
      actions: [
        {
          id: 'CA-HPG-FUTURE',
          symbol: 'HPG',
          type: 'CASH_DIVIDEND',
          status: 'ANNOUNCED',
          cashAmount: 2000,
          dates: {
            announcementDate: '2026-09-20',
            boardResolutionDate: '2026-09-20',
            exDate: '2026-12-01',
            recordDate: '2026-12-02',
            paymentDate: '2026-12-20',
            effectiveDate: '2026-12-01',
          },
          ratio: { oldShares: 1, newShares: 1, ratioDecimal: 1.0, rawExpression: '1:1' },
          fractionalSharePolicy: 'FLOOR',
          source: 'VSDC',
          sourceTier: 'TIER_1_REGULATOR',
          validationStatus: 'PASSED',
          freshness: 'CURRENT',
        },
      ],
    });

    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      corporateActionSnapshot: corp,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('NO_UPCOMING_DIVIDENDS_IN_WINDOW');
  });

  it('fails closed when Phase 23 snapshot is missing or UNAVAILABLE', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      corporateActionSnapshot: null,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('CORPORATE_ACTIONS_UNAVAILABLE');
  });
});
