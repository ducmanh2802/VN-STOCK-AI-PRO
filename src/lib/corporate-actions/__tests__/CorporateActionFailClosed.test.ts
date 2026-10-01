import { describe, it, expect } from 'vitest';
import { CorporateActionDateEngine } from '../CorporateActionDateEngine.ts';
import { CorporateActionEntitlementEngine } from '../CorporateActionEntitlementEngine.ts';
import { CorporateActionAdjustmentEngine } from '../CorporateActionAdjustmentEngine.ts';
import type { CorporateAction } from '../types.ts';

describe('Phase 23 — CorporateActionFailClosed', () => {
  it('fails closed on invalid date strings', () => {
    expect(() => CorporateActionDateEngine.deriveExDateFromRecordDate('')).toThrow();
    expect(() => CorporateActionDateEngine.deriveExDateFromRecordDate('not-a-date')).toThrow();
  });

  it('fails closed when date validation receives corrupted or empty dates', () => {
    const res = CorporateActionDateEngine.validateDates({
      announcementDate: null,
      exDate: '',
      recordDate: '',
      paymentDate: null,
      tradingDate: null,
      rightsStartDate: null,
      rightsEndDate: null,
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('fails closed on negative cash amount or negative issue price in reference price formula', () => {
    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 30_000,
        cashAmountVnd: -1000,
      })
    ).toThrow();

    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 30_000,
        issuePriceVnd: -5000,
      })
    ).toThrow();
  });

  it('fails closed when previous close is non-positive or non-finite', () => {
    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 0,
      })
    ).toThrow();

    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: -25_000,
      })
    ).toThrow();

    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: Number.NaN,
      })
    ).toThrow();
  });

  it('fails closed when cash dividend equals or exceeds previous close price', () => {
    expect(() =>
      CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 20_000,
        cashAmountVnd: 25_000, // Cash dividend > Stock price
      })
    ).toThrow();
  });

  it('returns null adjustment factor for CANCELLED corporate actions', () => {
    const action: CorporateAction = {
      id: 'CA_CANCELLED_TEST',
      symbol: 'TEST',
      isin: null,
      exchange: 'HOSE',
      actionType: 'CASH_DIVIDEND',
      status: 'CANCELLED',
      dates: {
        announcementDate: '2024-01-01',
        exDate: '2024-02-01',
        recordDate: '2024-02-02',
        paymentDate: '2024-02-20',
        tradingDate: null,
        rightsStartDate: null,
        rightsEndDate: null,
      },
      ratio: null,
      cashAmountVnd: 1000,
      cashYieldPercent: 10.0,
      issuePriceVnd: null,
      quantityExpected: null,
      rightsCode: null,
      rightsIsin: null,
      fractionalPolicy: 'NONE',
      source: 'VSDC',
      sourceTimestamp: Date.now(),
      fetchedAt: new Date().toISOString(),
      dataFreshness: 'CURRENT',
      warnings: [],
    };

    const factor = CorporateActionAdjustmentEngine.computeActionAdjustmentFactor(action, 25_000);
    expect(factor).toBeNull();
  });
});
