import { describe, it, expect } from 'vitest';
import {
  calculateRevenueGrowth,
  calculateProfitGrowth,
  calculateEPS,
  calculatePE,
  calculatePB,
  calculateROE,
  calculateROA,
  calculateDebtToEquity,
  calculateCurrentRatio,
  calculateDividendYield,
  calculateOperatingMargin,
  calculateNetMargin,
  calculateFreeCashFlow,
} from '../metrics.ts';
import { FundamentalScoreEngine } from '../FundamentalScoreEngine.ts';

describe('Fundamental Metrics & Scoring Suite', () => {
  describe('Isolated Metrics Formulas', () => {
    it('calculates Revenue Growth YoY correctly', () => {
      const res = calculateRevenueGrowth(1200, 1000);
      expect(res.value).toBe(20);
      expect(res.explanation).toBeUndefined();

      const missing = calculateRevenueGrowth(null, 1000);
      expect(missing.value).toBeNull();
      expect(missing.explanation).toBeDefined();

      const zeroPrev = calculateRevenueGrowth(1000, 0);
      expect(zeroPrev.value).toBeNull();
    });

    it('calculates Net Profit Growth with turnaround handling', () => {
      const normal = calculateProfitGrowth(150, 100);
      expect(normal.value).toBe(50);

      const turnaround = calculateProfitGrowth(50, -100);
      expect(turnaround.value).toBe(150);
      expect(turnaround.explanation).toContain('Turnaround');

      const missing = calculateProfitGrowth(undefined, 100);
      expect(missing.value).toBeNull();
    });

    it('calculates EPS accurately', () => {
      const res = calculateEPS(1000000000, 1000000);
      expect(res.value).toBe(1000);

      const invalid = calculateEPS(1000000, 0);
      expect(invalid.value).toBeNull();
    });

    it('calculates P/E ratio and handles negative/zero EPS', () => {
      const normal = calculatePE(50000, 5000);
      expect(normal.value).toBe(10);

      const negEPS = calculatePE(50000, -2000);
      expect(negEPS.value).toBeNull();
      expect(negEPS.explanation).toContain('EPS âm hoặc bằng 0');
    });

    it('calculates P/B ratio and handles negative book value', () => {
      const normal = calculatePB(50000, 25000);
      expect(normal.value).toBe(2);

      const negBV = calculatePB(50000, -5000);
      expect(negBV.value).toBeNull();
      expect(negBV.explanation).toContain('BVPS <= 0');
    });

    it('calculates ROE & ROA percentages', () => {
      const roe = calculateROE(250, 1000);
      expect(roe.value).toBe(25);

      const roa = calculateROA(150, 1500);
      expect(roa.value).toBe(10);
    });

    it('calculates Debt to Equity & Current Ratio', () => {
      const de = calculateDebtToEquity(600, 1000);
      expect(de.value).toBe(0.6);

      const cr = calculateCurrentRatio(1500, 1000);
      expect(cr.value).toBe(1.5);
    });

    it('calculates Dividend Yield (%)', () => {
      const dy = calculateDividendYield(2500, 50000);
      expect(dy.value).toBe(5);

      const missing = calculateDividendYield(null, 50000);
      expect(missing.value).toBeNull();
      expect(missing.explanation).toBeDefined();
    });

    it('calculates Operating Margin & Net Margin (%)', () => {
      const opMargin = calculateOperatingMargin(200, 1000);
      expect(opMargin.value).toBe(20);

      const netMargin = calculateNetMargin(150, 1000);
      expect(netMargin.value).toBe(15);
    });

    it('calculates Free Cash Flow (FCF = OCF - CapEx)', () => {
      const fcf = calculateFreeCashFlow(500, 200);
      expect(fcf.value).toBe(300);

      const missing = calculateFreeCashFlow(null, 200);
      expect(fcf.value).toBe(300);
      expect(missing.value).toBeNull();
      expect(missing.explanation).toBeDefined();
    });
  });

  describe('FundamentalScoreEngine', () => {
    it('evaluates healthy enterprise data across all categories', () => {
      const result = FundamentalScoreEngine.evaluate({
        price: 75000,
        currentRevenue: 52000000000000,
        previousRevenue: 44000000000000,
        currentProfit: 9200000000000,
        previousProfit: 7600000000000,
        operatingProfit: 11000000000000,
        totalAssets: 60000000000000,
        totalLiabilities: 24000000000000,
        totalEquity: 36000000000000,
        currentAssets: 30000000000000,
        currentLiabilities: 18000000000000,
        operatingCashFlow: 8500000000000,
        capitalExpenditure: 2000000000000,
        outstandingShares: 1460000000,
        dividendPerShare: 3500,
        bookValuePerShare: 35000,
      });

      expect(result.score).not.toBeNull();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);

      expect(result.breakdown.growth).toBeGreaterThan(60);
      expect(result.breakdown.profitability).toBeGreaterThan(60);
      expect(result.breakdown.financialHealth).toBeGreaterThan(60);
      expect(result.breakdown.cashFlow).toBeGreaterThan(60);
      expect(result.breakdown.valuationQuality).toBeGreaterThan(60);

      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('does not fabricate missing financial data and records explanations', () => {
      const partialResult = FundamentalScoreEngine.evaluate({
        price: 50000,
        currentRevenue: 10000,
        // previousRevenue missing
        currentProfit: 2000,
        // previousProfit missing
        // totalAssets missing
        totalEquity: 8000,
        totalLiabilities: 4000,
        outstandingShares: 100,
      });

      // Missing metrics produce null
      expect(partialResult.metrics.revenueGrowth).toBeNull();
      expect(partialResult.metrics.profitGrowth).toBeNull();
      expect(partialResult.metrics.roa).toBeNull();
      expect(partialResult.metrics.freeCashFlow).toBeNull();

      // Explanations for missing fields are stored
      expect(partialResult.missingDataExplanations).toHaveProperty('revenueGrowth');
      expect(partialResult.missingDataExplanations).toHaveProperty('profitGrowth');
      expect(partialResult.missingDataExplanations).toHaveProperty('roa');
      expect(partialResult.missingDataExplanations).toHaveProperty('freeCashFlow');

      // Breakdown still calculates for available categories
      expect(partialResult.breakdown.financialHealth).not.toBeNull();
    });

    it('returns score null when data is completely absent', () => {
      const emptyResult = FundamentalScoreEngine.evaluate({});
      expect(emptyResult.score).toBeNull();
      expect(emptyResult.warnings.length).toBeGreaterThan(0);
    });
  });
});
