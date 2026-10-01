import { describe, it, expect } from 'vitest';
import { CorporateActionAdjustmentEngine } from '../CorporateActionAdjustmentEngine.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type { CorporateActionAdjustmentFactor } from '../types.ts';

describe('Phase 23 — CorporateActionAdjustmentEngine', () => {
  describe('Ex-Reference Price Formulas', () => {
    it('calculates cash dividend adjustment: P_ex = P_prev - C', () => {
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 30_000,
        cashAmountVnd: 2_000,
      });

      expect(res.exReferencePrice).toBe(28_000);
      expect(res.factor).toBeCloseTo(28_000 / 30_000, 5);
      expect(res.isOtmRightsSuppressed).toBe(false);
    });

    it('calculates stock dividend adjustment: P_ex = P_prev / (1 + S)', () => {
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 50_000,
        stockDividendRatio: 0.25, // 25%
      });

      expect(res.exReferencePrice).toBe(40_000);
      expect(res.factor).toBeCloseTo(40_000 / 50_000, 5);
    });

    it('calculates bonus issue adjustment: P_ex = P_prev / (1 + B)', () => {
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 40_000,
        bonusRatio: 1.0, // 1:1 (100% bonus)
      });

      expect(res.exReferencePrice).toBe(20_000);
      expect(res.factor).toBeCloseTo(0.5, 5);
    });

    it('calculates in-the-money rights issue: P_ex = (P_prev + I * P_issue) / (1 + I)', () => {
      // P_prev = 30,000, Rights 10:1 (I = 0.1), P_issue = 10,000
      // P_ex = (30,000 + 0.1 * 10,000) / (1 + 0.1) = 31,000 / 1.1 = 28,181.8182
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 30_000,
        rightsRatio: 0.10,
        issuePriceVnd: 10_000,
      });

      expect(res.exReferencePrice).toBeCloseTo(28_181.8182, 3);
      expect(res.factor).toBeCloseTo(28_181.8182 / 30_000, 5);
      expect(res.isOtmRightsSuppressed).toBe(false);
    });

    it('suppresses dilution on Out-Of-The-Money (OTM) rights issue where P_issue >= P_prev', () => {
      // P_prev = 25,000, P_issue = 30,000 (OTM rights)
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 25_000,
        rightsRatio: 0.20,
        issuePriceVnd: 30_000,
      });

      expect(res.isOtmRightsSuppressed).toBe(true);
      expect(res.exReferencePrice).toBe(25_000);
      expect(res.factor).toBe(1.0);
    });

    it('calculates combined cash and stock dividend', () => {
      // P_prev = 42,000, C = 2,000, S = 0.25 (25%)
      // P_ex = (42,000 - 2,000) / (1 + 0.25) = 40,000 / 1.25 = 32,000
      const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
        prevClose: 42_000,
        cashAmountVnd: 2_000,
        stockDividendRatio: 0.25,
      });

      expect(res.exReferencePrice).toBe(32_000);
      expect(res.factor).toBeCloseTo(32_000 / 42_000, 5);
    });
  });

  describe('Historical Price Series Backward Adjustment', () => {
    const rawBars: CandlePoint[] = [
      { time: '2024-05-10', open: 29_000, high: 30_000, low: 28_500, close: 29_500, volume: 1_000_000 },
      { time: '2024-05-21', open: 30_000, high: 31_000, low: 29_800, close: 30_500, volume: 1_500_000 },
      // Ex-Date is 2024-05-22
      { time: '2024-05-22', open: 27_000, high: 28_000, low: 26_800, close: 27_500, volume: 2_000_000 },
      { time: '2024-05-23', open: 27_600, high: 28_200, low: 27_400, close: 28_000, volume: 1_800_000 },
    ];

    it('adjusts historical bars strictly prior to Ex-Date without mutating raw bars', () => {
      const factor: CorporateActionAdjustmentFactor = {
        exDate: '2024-05-22',
        actionId: 'CA_TEST_1',
        actionType: 'STOCK_DIVIDEND',
        factor: 0.90, // 10% dividend
        inverseFactor: 1 / 0.90,
        prevClosePrice: 30_500,
        exReferencePrice: 27_450,
        formulaApplied: 'TEST',
      };

      const adjusted = CorporateActionAdjustmentEngine.adjustPriceSeries(rawBars, [factor]);

      expect(adjusted.length).toBe(rawBars.length);

      // Bar on 2024-05-10 (before Ex-Date): scaled by factor 0.90
      expect(adjusted[0].close).toBeCloseTo(29_500 * 0.90, 1);
      expect(adjusted[0].volume).toBe(Math.round(1_000_000 / 0.90));
      expect(adjusted[0].rawClose).toBe(29_500);
      expect(adjusted[0].cumulativeAdjustmentFactor).toBe(0.90);

      // Bar on 2024-05-21 (day before Ex-Date): scaled by factor 0.90
      expect(adjusted[1].close).toBeCloseTo(30_500 * 0.90, 1);

      // Bar on 2024-05-22 (on Ex-Date): unadjusted (factor 1.0)
      expect(adjusted[2].close).toBe(27_500);
      expect(adjusted[2].volume).toBe(2_000_000);
      expect(adjusted[2].cumulativeAdjustmentFactor).toBe(1.0);

      // Bar on 2024-05-23 (after Ex-Date): unadjusted
      expect(adjusted[3].close).toBe(28_000);

      // Raw array remains completely immutable
      expect(rawBars[0].close).toBe(29_500);
      expect(rawBars[0].volume).toBe(1_000_000);
    });

    it('returns unchanged series when factor list is empty', () => {
      const adjusted = CorporateActionAdjustmentEngine.adjustPriceSeries(rawBars, []);
      expect(adjusted[0].close).toBe(rawBars[0].close);
      expect(adjusted[0].cumulativeAdjustmentFactor).toBe(1.0);
    });
  });
});
