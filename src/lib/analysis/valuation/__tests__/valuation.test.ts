import { describe, it, expect } from 'vitest';
import {
  calculatePEValuation,
  calculatePBValuation,
  calculateDCFValuation,
  calculateDividendValuation,
  calculateHistoricalValuation,
} from '../formulas.ts';
import { ValuationEngine } from '../ValuationEngine.ts';

describe('Valuation Engine & Formulas Suite', () => {
  describe('Pure Formula Functions', () => {
    it('calculates P/E valuation accurately', () => {
      const res = calculatePEValuation(6000, 16);
      expect(res.value).toBe(96000);
      expect(res.reason).toBeUndefined();

      const negEPS = calculatePEValuation(-1000, 15);
      expect(negEPS.value).toBeNull();
      expect(negEPS.reason).toContain('EPS âm hoặc bằng 0');
    });

    it('calculates P/B valuation accurately', () => {
      const res = calculatePBValuation(30000, 2.0);
      expect(res.value).toBe(60000);

      const invalid = calculatePBValuation(0, 2.0);
      expect(invalid.value).toBeNull();
    });

    it('calculates 2-stage DCF valuation accurately', () => {
      const dcf = calculateDCFValuation({
        freeCashFlow: 5000000000000, // 5000 tỷ
        growthRate5Y: 0.15,          // 15%
        terminalGrowthRate: 0.03,    // 3%
        discountRateWACC: 0.11,      // 11%
        netDebt: 2000000000000,      // 2000 tỷ
        outstandingShares: 1000000000, // 1 tỷ cổ phiếu
      });

      expect(dcf.value).not.toBeNull();
      expect(dcf.value!).toBeGreaterThan(0);
    });

    it('handles invalid DCF inputs (WACC <= terminal growth rate or negative FCF)', () => {
      const invalidWacc = calculateDCFValuation({
        freeCashFlow: 1000,
        growthRate5Y: 0.1,
        terminalGrowthRate: 0.12,
        discountRateWACC: 0.10, // WACC < g2
        outstandingShares: 100,
      });
      expect(invalidWacc.value).toBeNull();
      expect(invalidWacc.reason).toContain('Lãi suất chiết khấu (WACC) phải lớn hơn');

      const negFCF = calculateDCFValuation({
        freeCashFlow: -500,
        outstandingShares: 100,
      });
      expect(negFCF.value).toBeNull();
      expect(negFCF.reason).toContain('âm');
    });

    it('calculates Gordon Growth Dividend Model', () => {
      const ddm = calculateDividendValuation({
        annualDividendPerShare: 2000,
        dividendGrowthRate: 0.05,
        requiredReturnRate: 0.10,
      });
      expect(ddm.value).toBe(42000); // 2000 * 1.05 / 0.05 = 42,000

      const zeroDiv = calculateDividendValuation({
        annualDividendPerShare: 0,
      });
      expect(zeroDiv.value).toBeNull();
      expect(zeroDiv.reason).toContain('không chi trả cổ tức');
    });

    it('calculates Historical Valuation based on median multiples', () => {
      const hist = calculateHistoricalValuation({
        eps: 5000,
        bookValuePerShare: 25000,
        historicalMedianPE: 15, // 75,000
        historicalMedianPB: 2.2, // 55,000
      });
      expect(hist.value).toBe(65000); // (75000 + 55000) / 2 = 65,000
    });
  });

  describe('ValuationEngine Evaluation', () => {
    it('evaluates comprehensive fair value with weighted multi-method models', () => {
      const result = ValuationEngine.evaluate({
        currentPrice: 100000,
        eps: 7000,
        bookValuePerShare: 45000,
        freeCashFlow: 6000000000000,
        growthRate5Y: 0.15,
        discountRateWACC: 0.105,
        netDebt: 1000000000000,
        outstandingShares: 1200000000,
        annualDividendPerShare: 2500,
        historicalMedianPE: 16,
        historicalMedianPB: 2.4,
      });

      expect(result.status).toBe('success');
      expect(result.fairValuePE).toBeGreaterThan(0);
      expect(result.fairValuePB).toBeGreaterThan(0);
      expect(result.fairValueDCF).toBeGreaterThan(0);
      expect(result.fairValueDividend).toBeGreaterThan(0);
      expect(result.fairValueHistorical).toBeGreaterThan(0);

      expect(result.weightedFairValue).not.toBeNull();
      expect(result.upsidePercent).not.toBeNull();
      expect(result.valuationScore).toBeGreaterThanOrEqual(0);
      expect(result.valuationScore).toBeLessThanOrEqual(100);

      // Verify disclaimer requirement
      expect(result.disclaimer).toBeDefined();
      expect(result.disclaimer.length).toBeGreaterThan(20);

      expect(result.notes.length).toBeGreaterThan(0);
    });

    it('returns insufficient_data when required inputs are completely missing', () => {
      const result = ValuationEngine.evaluate({
        currentPrice: 50000,
        // No EPS, BVPS, FCF, or Dividends provided
      });

      expect(result.status).toBe('insufficient_data');
      expect(result.weightedFairValue).toBeNull();
      expect(result.upsidePercent).toBeNull();
      expect(result.valuationScore).toBeNull();
      expect(result.notes.some((n) => n.includes('Không đủ dữ liệu'))).toBe(true);
    });

    it('handles non-positive currentPrice gracefully', () => {
      const result = ValuationEngine.evaluate({
        currentPrice: -10,
        eps: 5000,
      });
      expect(result.status).toBe('insufficient_data');
    });
  });
});
