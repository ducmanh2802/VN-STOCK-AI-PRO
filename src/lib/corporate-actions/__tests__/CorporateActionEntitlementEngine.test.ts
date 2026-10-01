import { describe, it, expect } from 'vitest';
import { CorporateActionEntitlementEngine } from '../CorporateActionEntitlementEngine.ts';

describe('Phase 23 — CorporateActionEntitlementEngine', () => {
  it('correctly parses standard Vietnam market ratios', () => {
    const r1 = CorporateActionEntitlementEngine.parseRatio('100:8');
    expect(r1.oldShares).toBe(100);
    expect(r1.newShares).toBe(8);
    expect(r1.ratioDecimal).toBe(0.08);

    const r2 = CorporateActionEntitlementEngine.parseRatio('10:1');
    expect(r2.oldShares).toBe(10);
    expect(r2.newShares).toBe(1);
    expect(r2.ratioDecimal).toBe(0.10);

    const r3 = CorporateActionEntitlementEngine.parseRatio('20:3');
    expect(r3.oldShares).toBe(20);
    expect(r3.newShares).toBe(3);
    expect(r3.ratioDecimal).toBe(0.15);
  });

  it('rejects malformed, zero-denominator, or negative ratio strings', () => {
    expect(() => CorporateActionEntitlementEngine.parseRatio('')).toThrow();
    expect(() => CorporateActionEntitlementEngine.parseRatio('0:10')).toThrow();
    expect(() => CorporateActionEntitlementEngine.parseRatio('100:-5')).toThrow();
    expect(() => CorporateActionEntitlementEngine.parseRatio('invalid_ratio')).toThrow();
  });

  it('calculates integer whole entitlement and truncates fractional shares under FLOOR policy', () => {
    const ratio = CorporateActionEntitlementEngine.parseRatio('100:8'); // 0.08

    // 150 shares -> 150 * 0.08 = 12.0
    const res1 = CorporateActionEntitlementEngine.calculateEntitlement({
      holdingShares: 150,
      ratio,
      policy: 'FLOOR',
    });
    expect(res1.wholeShares).toBe(12);
    expect(res1.fractionalShares).toBe(0);

    // 115 shares -> 115 * 0.08 = 9.2 -> 9 whole shares, 0.2 fractional
    const res2 = CorporateActionEntitlementEngine.calculateEntitlement({
      holdingShares: 115,
      ratio,
      policy: 'FLOOR',
    });
    expect(res2.wholeShares).toBe(9);
    expect(res2.fractionalShares).toBe(0.2);
    expect(res2.theoreticalEntitlement).toBe(9.2);
  });

  it('calculates cash entitlement for cash dividend', () => {
    const ratio = CorporateActionEntitlementEngine.parseRatio('1:1');
    const res = CorporateActionEntitlementEngine.calculateEntitlement({
      holdingShares: 10_000,
      ratio,
      cashAmountVnd: 1500, // 1,500 VND/cp
    });

    expect(res.cashEntitlementVnd).toBe(15_000_000);
  });

  it('rejects negative holding balance or negative cash amount', () => {
    const ratio = CorporateActionEntitlementEngine.parseRatio('10:1');
    expect(() =>
      CorporateActionEntitlementEngine.calculateEntitlement({
        holdingShares: -100,
        ratio,
      })
    ).toThrow();

    expect(() =>
      CorporateActionEntitlementEngine.calculateEntitlement({
        holdingShares: 100,
        ratio,
        cashAmountVnd: -500,
      })
    ).toThrow();
  });
});
