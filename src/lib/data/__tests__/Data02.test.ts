/**
 * DATA-02 TESTS — dividends, splits, symbol changes, raw/adjusted separation
 */
import { describe, it, expect } from 'vitest';
import { CorporateActionValidator, AdjustmentEngine } from '../CorporateActionsEngine.ts';
import type { CanonicalBar, CorporateActionRecord } from '../types.ts';

function ca(partial: Partial<CorporateActionRecord> & { eventId: string }): CorporateActionRecord {
  return {
    instrumentId: 'VN-HOSE-HPG',
    kind: 'CASH_DIVIDEND',
    status: 'CONFIRMED',
    announcementDate: '2024-03-01',
    recordDate: '2024-04-10',
    exDate: '2024-04-09',
    paymentDate: '2024-05-01',
    effectiveDate: null,
    ratioOld: null,
    ratioNew: null,
    cashAmountVnd: 1000,
    issuePriceVnd: null,
    symbolChangeFrom: null,
    symbolChangeTo: null,
    source: 'VSDC',
    sourceTier: 'TIER_1_STATUTORY',
    dataVersion: 'v1',
    ...partial,
  };
}

function bar(date: string, close: number): CanonicalBar {
  return {
    instrumentId: 'VN-HOSE-HPG', date, open: close, high: close, low: close, close,
    volume: 1000, value: close * 1000, source: 'KBS', quality: 'VALID',
  };
}

describe('CorporateActionValidator', () => {
  it('accepts valid cash dividend', () => {
    const { valid, issues } = CorporateActionValidator.validate([ca({ eventId: 'e1' })]);
    expect(valid.length).toBe(1);
    expect(issues.length).toBe(0);
  });

  it('fails closed on duplicates, impossible dates, negative dividends, bad ratios', () => {
    const dup = ca({ eventId: 'e1' });
    const bad1 = ca({ eventId: 'e2', announcementDate: '2024-05-01', exDate: '2024-04-01' });
    const bad2 = ca({ eventId: 'e3', cashAmountVnd: -5 });
    const bad3 = ca({ eventId: 'e4', kind: 'STOCK_SPLIT', ratioOld: 0, ratioNew: 2, cashAmountVnd: null });
    const bad4 = ca({ eventId: 'e5', kind: 'SYMBOL_CHANGE', symbolChangeFrom: null, cashAmountVnd: null });
    const { valid, issues } = CorporateActionValidator.validate([dup, { ...dup, eventId: 'e1b' }, bad1, bad2, bad3, bad4]);
    expect(valid.length).toBe(1);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('DUPLICATE_EVENT');
    expect(codes).toContain('IMPOSSIBLE_DATES');
    expect(codes).toContain('NEGATIVE_DIVIDEND');
    expect(codes).toContain('INVALID_SPLIT_RATIO');
    expect(codes).toContain('MISSING_REQUIRED_DATE_OR_VALUE');
  });

  it('rejects TIER_4 unverified sources', () => {
    const { valid } = CorporateActionValidator.validate([ca({ eventId: 'e9', sourceTier: 'TIER_4_UNVERIFIED' })]);
    expect(valid.length).toBe(0);
  });

  it('flags conflicting symbol-change chains', () => {
    const s1 = ca({ eventId: 's1', kind: 'SYMBOL_CHANGE', announcementDate: '2024-01-01', recordDate: '2024-01-10', exDate: '2024-01-09', symbolChangeFrom: 'A', symbolChangeTo: 'B', cashAmountVnd: null });
    const s2 = ca({ eventId: 's2', kind: 'SYMBOL_CHANGE', announcementDate: '2024-02-01', recordDate: '2024-02-10', exDate: '2024-02-09', symbolChangeFrom: 'X', symbolChangeTo: 'Y', cashAmountVnd: null });
    const { issues } = CorporateActionValidator.validate([s1, s2]);
    expect(issues.map((i) => i.code)).toContain('CONFLICTING_SYMBOL_CHANGE');
  });
});

describe('AdjustmentEngine', () => {
  it('keeps RAW immutable and derives ADJUSTED via cumulative K', () => {
    const bars = [bar('2024-04-05', 20000), bar('2024-04-08', 20000), bar('2024-04-10', 19000)];
    const raw = AdjustmentEngine.adjust(bars, [], {}, 'RAW');
    expect(raw).toEqual(bars);
    const split = ca({
      eventId: 'sp', kind: 'STOCK_SPLIT', status: 'COMPLETED',
      exDate: '2024-04-09', ratioOld: 1, ratioNew: 2, cashAmountVnd: null,
    });
    const adj = AdjustmentEngine.adjust(bars, [split], { '2024-04-09': 20000 }, 'ADJUSTED');
    expect(adj[0].close).toBe(10000);
    expect(adj[0].volume).toBe(2000);
    expect(adj[2].close).toBe(19000);
    expect(bars[0].close).toBe(20000);
  });

  it('applies cash-dividend factor P_ex=(P_prev-C)/(1) and suppresses OTM rights', () => {
    const div = ca({ eventId: 'd', exDate: '2024-04-09', cashAmountVnd: 1000 });
    const k = AdjustmentEngine.factorForEvent(div, 20000);
    expect(k).toBeCloseTo(19000 / 20000, 10);
    const otm = ca({
      eventId: 'r', kind: 'RIGHTS_ISSUE', exDate: '2024-04-09',
      ratioOld: 10, ratioNew: 1, cashAmountVnd: null, issuePriceVnd: 25000,
    });
    const k2 = AdjustmentEngine.factorForEvent(otm, 20000);
    expect(k2).toBe(1);
  });

  it('cancelled events yield null factor', () => {
    const c = ca({ eventId: 'c', status: 'CANCELLED' });
    expect(AdjustmentEngine.factorForEvent(c, 20000)).toBeNull();
  });
});
