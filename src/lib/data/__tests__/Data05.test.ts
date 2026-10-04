/**
 * DATA-05 TESTS — asset classes, futures, equities, ETFs, cash, calendars, units
 */
import { describe, it, expect } from 'vitest';
import {
  MultiAssetEngine,
  MarketCalendar,
  NormalizationEngine,
  FUTURES_MULTIPLIER_VND,
  FUTURES_TICK_POINTS,
  EQUITY_STANDARD_LOT,
} from '../MultiAssetEngine.ts';

describe('MultiAssetEngine', () => {
  it('preserves Phase 29 futures semantics', () => {
    expect(FUTURES_MULTIPLIER_VND).toBe(100000);
    expect(FUTURES_TICK_POINTS).toBe(0.1);
    expect(EQUITY_STANDARD_LOT).toBe(100);
    const ok = MultiAssetEngine.validateContract(
      { contractCode: 'VN30F2601', underlying: 'VN30', expiryDate: '2026-01-15', multiplier: 100000, tickSize: 0.1 },
      '2026-01-01'
    );
    expect(ok.valid).toBe(true);
    expect(
      MultiAssetEngine.validateContract(
        { contractCode: 'VN30F2601', underlying: 'VN30', expiryDate: '2025-12-01', multiplier: 100000, tickSize: 0.1 },
        '2026-01-01'
      ).reason
    ).toBe('EXPIRED');
  });

  it('rejects wrong multiplier/tick and bad expiry', () => {
    expect(
      MultiAssetEngine.validateContract(
        { contractCode: 'X', underlying: 'VN30', expiryDate: '2026-01-15', multiplier: 1, tickSize: 0.1 },
        '2026-01-01'
      ).valid
    ).toBe(false);
    expect(
      MultiAssetEngine.validateContract(
        { contractCode: 'X', underlying: 'VN30', expiryDate: 'bad', multiplier: 100000, tickSize: 0.1 },
        '2026-01-01'
      ).valid
    ).toBe(false);
  });

  it('preserves lot-size semantics and cash face-value rule', () => {
    expect(MultiAssetEngine.validateEquityQuantity(100)).toBe(true);
    expect(MultiAssetEngine.validateEquityQuantity(1.5)).toBe(false);
    expect(MultiAssetEngine.validateCashRecord(false).valid).toBe(true);
    expect(MultiAssetEngine.validateCashRecord(true).valid).toBe(false);
  });

  it('fails clearly on unsupported asset classes', () => {
    expect(MultiAssetEngine.isSupported('EQUITY')).toBe(true);
    expect(MultiAssetEngine.isSupported('BOND')).toBe(false);
    expect(() => MultiAssetEngine.requireSupported('CRYPTO')).toThrow('UNSUPPORTED_ASSET_CLASS');
  });
});

describe('MarketCalendar', () => {
  it('knows weekends, holidays, sessions, timezone', () => {
    expect(MarketCalendar.isWeekend('2024-01-06')).toBe(true);
    expect(MarketCalendar.isWeekend('2024-01-08')).toBe(false);
    expect(MarketCalendar.isHoliday('2024-09-02')).toBe(true);
    expect(MarketCalendar.isTradingDay('2024-09-02')).toBe(false);
    expect(MarketCalendar.sessionAt(541)).toBe('ATO');
    expect(MarketCalendar.sessionAt(600)).toBe('CONTINUOUS_AM');
    expect(MarketCalendar.sessionAt(700)).toBe('LUNCH');
    expect(MarketCalendar.sessionAt(871)).toBe('ATC');
    expect(MarketCalendar.sessionAt(900)).toBe('CLOSED');
    expect(MarketCalendar.timezone()).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('NormalizationEngine', () => {
  it('normalizes VPS units without destroying precision', () => {
    expect(NormalizationEngine.vpsPriceToVnd(21.8)).toBeCloseTo(21800, 6);
    expect(NormalizationEngine.vpsLotsToShares(10)).toBe(100);
    expect(NormalizationEngine.futuresPointsToNotional(1320.5, 2)).toBe(2 * 1320.5 * 100000);
    expect(NormalizationEngine.roundToTick(1320.53)).toBeCloseTo(1320.5, 9);
  });
});
