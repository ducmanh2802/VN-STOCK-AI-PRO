/**
 * PHASE 6 — Enterprise Intelligence Engine unit tests.
 * Covers the deterministic formulas, DuPont (3 & 5 factor), Piotroski,
 * valuation fair values, DCF, margin of safety, scenarios, enterprise score
 * weights and data completeness. All fixtures are self-contained.
 */
import { describe, it, expect } from 'vitest';
import { AnnualFinancialFact, EMPTY_FACT, FinancialFactSet, DEFAULT_CONFIG } from '../financialFacts.ts';
import { GrowthEngine } from '../GrowthEngine.ts';
import { ProfitabilityEngine } from '../ProfitabilityEngine.ts';
import { FinancialHealthEngine } from '../FinancialHealthEngine.ts';
import { EarningsQualityEngine } from '../EarningsQualityEngine.ts';
import { DuPontEngine } from '../DuPontEngine.ts';
import { PiotroskiEngine } from '../PiotroskiEngine.ts';
import { ValuationIntelligenceEngine } from '../ValuationIntelligenceEngine.ts';
import { ScenarioEngine } from '../ScenarioEngine.ts';
import { EnterpriseScoreEngine } from '../EnterpriseScoreEngine.ts';
import { DataCompletenessEngine } from '../DataCompletenessEngine.ts';
import { cagr, pctChange, safeDiv, percentileRank } from '../helpers.ts';

function fact(y: number, overrides: Partial<AnnualFinancialFact>): AnnualFinancialFact {
  return { ...EMPTY_FACT, year: y, source: 'TEST', calculationMethod: 'period_end', ...overrides };
}

function set(...facts: AnnualFinancialFact[]): FinancialFactSet {
  return { annals: facts };
}

describe('PHASE 6 helpers (deterministic)', () => {
  it('computes CAGR correctly', () => {
    expect(cagr(121, 100, 2)).toBeCloseTo(10, 5); // (121/100)^(1/2)-1 = 0.10
    expect(cagr(100, 100, 1)).toBe(0);
    expect(cagr(0, 100, 2)).toBe(-100);
    expect(cagr(121, null, 2)).toBeNull();
  });

  it('computes percent change and safe division without NaN/Infinity', () => {
    expect(pctChange(120, 100)).toBeCloseTo(20, 5);
    expect(pctChange(100, 0)).toBeNull();
    expect(safeDiv(10, 0)).toBeNull();
    expect(safeDiv(10, 2)).toBe(5);
  });

  it('computes percentile rank in [0,1]', () => {
    const pct = percentileRank(50, [10, 20, 30, 40, 60]);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThanOrEqual(0);
    expect(pct!).toBeLessThanOrEqual(1);
  });
});

describe('GrowthEngine', () => {
  const years = set(
    fact(2021, { revenue: 800, netProfit: 60, eps: 6, cfo: 80, capex: 20 }),
    fact(2022, { revenue: 1000, netProfit: 100, eps: 10, cfo: 150, capex: 30 }),
    fact(2023, { revenue: 1200, netProfit: 140, eps: 14, cfo: 180, capex: 40 })
  );
  const r = GrowthEngine.evaluate(years);
  it('computes revenue YoY', () => {
    expect(r.revenueYoY).toBeCloseTo(20, 5);
  });
  it('computes FCF growth from CFO - CAPEX', () => {
    // FCF prev = 150-30=120, cur = 180-40=140 → +16.67%
    expect(r.fcfGrowth).toBeCloseTo(16.67, 1);
  });
  it('classifies strong, consistent growth', () => {
    expect(r.classification).toBe('HEALTHY');
  });
  it('returns null classification when no data', () => {
    expect(GrowthEngine.evaluate(set()).classification).toBeNull();
  });
});

describe('ProfitabilityEngine', () => {
  const cur = fact(2023, { revenue: 1000, grossProfit: 400, operatingProfit: 150, netProfit: 100, totalAssets: 500, totalEquity: 250, totalLiabilities: 250, cash: 50 });
  const prev = fact(2022, { revenue: 800, grossProfit: 300, operatingProfit: 120, netProfit: 60, totalAssets: 500, totalEquity: 250, totalLiabilities: 250, cash: 50 });
  const r = ProfitabilityEngine.evaluate(set(cur, prev));

  it('computes margins', () => {
    expect(r.grossMargin).toBe(40);
    expect(r.netMargin).toBe(10);
  });
  it('computes ROE = NI / average equity', () => {
    expect(r.roe).toBe(40);
  });
  it('computes ROA = NI / average assets', () => {
    expect(r.roa).toBe(20);
  });
  it('computes ROIC = NOPAT / average invested capital (tax 0)', () => {
    // invested = 250 + 250 - 50 = 450; NOPAT = EBIT 150 → 33.33
    expect(r.roic).toBeCloseTo(33.33, 1);
  });
});

describe('FinancialHealthEngine', () => {
  const cur = fact(2023, { revenue: 1000, totalAssets: 1000, totalLiabilities: 600, totalEquity: 400, currentAssets: 300, currentLiabilities: 120, inventory: 100, cash: 200, longTermDebt: 300, ebitda: 200, operatingProfit: 180, interestExpense: 30 });
  const prev = fact(2022, { totalLiabilities: 500, longTermDebt: 250 });
  const r = FinancialHealthEngine.evaluate(set(cur, prev));

  it('computes current ratio', () => {
    expect(r.currentRatio).toBe(2.5);
  });
  it('computes quick ratio ex inventory', () => {
    // (300 - 100) / 120 = 1.67
    expect(r.quickRatio).toBeCloseTo(1.67, 1);
  });
  it('computes debt/equity', () => {
    expect(r.debtToEquity).toBeCloseTo(0.75, 1);
  });
  it('computes net debt / EBITDA', () => {
    expect(r.netDebtToEBITDA).toBeCloseTo(0.5, 1); // (300-200)/200
  });
  it('computes interest coverage', () => {
    expect(r.interestCoverage).toBe(6); // EBIT 180 / 30
  });
  it('computes debt growth', () => {
    expect(r.debtGrowth).toBeCloseTo(20, 1); // (300/250 - 1)*100
  });
});

describe('EarningsQualityEngine', () => {
  const cur = fact(2023, { revenue: 1000, netProfit: 100, cfo: 150, capex: 30, totalAssets: 500, receivables: 200, inventory: 150 });
  const prev = fact(2022, { netProfit: 60, cfo: 80, receivables: null, inventory: 100 });
  const r = EarningsQualityEngine.evaluate(set(cur, prev), DEFAULT_CONFIG);

  it('computes FCF = CFO - CAPEX', () => {
    expect(r.fcf).toBe(120);
  });
  it('computes cash conversion CFO / NI', () => {
    expect(r.cashConversion).toBe(1.5);
  });
  it('classifies profit as cash-supported', () => {
    expect(r.qualityClassification).toBe('PROFIT_SUPPORTED_BY_CASH');
  });
  it('computes CFO margin', () => {
    expect(r.cfoMargin).toBe(15);
  });
});

describe('DuPontEngine — 3-factor fixture (Section 40)', () => {
  const years = set(
    fact(2022, { revenue: 1000, netProfit: 100, totalAssets: 500, totalEquity: 250 }),
    fact(2023, { revenue: 1000, netProfit: 100, totalAssets: 500, totalEquity: 250 })
  );
  const d = DuPontEngine.evaluate(years);
  it('NPM = 10%, AT = 2.0, EM = 2.0, ROE = 40%', () => {
    expect(d.threeFactor.netProfitMargin).toBeCloseTo(0.1, 4);
    expect(d.threeFactor.assetTurnover).toBeCloseTo(2.0, 3);
    expect(d.threeFactor.equityMultiplier).toBeCloseTo(2.0, 3);
    expect(d.threeFactor.calculatedROE).toBeCloseTo(40, 2);
  });
  it('reported ROE reconciles with calculated ROE', () => {
    expect(d.threeFactor.reportedROE).toBeCloseTo(40, 2);
    expect(Math.abs(d.threeFactor.reconciliationDifference!)).toBeLessThan(0.5);
  });
});

describe('Piotroski F-Score (Section 39)', () => {
  const cur = fact(2023, {
    revenue: 1000, grossProfit: 400, netProfit: 100, cfo: 150,
    totalAssets: 800, totalEquity: 400, longTermDebt: 200, totalLiabilities: 200,
    currentAssets: 300, currentLiabilities: 100, sharesOutstanding: 100,
  });
  const prev = fact(2022, {
    revenue: 800, grossProfit: 280, netProfit: 60, cfo: 80,
    totalAssets: 820, totalEquity: 400, longTermDebt: 250, totalLiabilities: 250,
    currentAssets: 250, currentLiabilities: 120, sharesOutstanding: 100,
  });
  const full = PiotroskiEngine.evaluate(set(cur, prev));
  it('scores 9/9 when all criteria pass', () => {
    expect(full.total).toBe(9);
    expect(full.maxAvailable).toBe(9);
    expect(full.normalizedScore).toBe(9);
    expect(full.profitability).toBe(4);
    expect(full.leverageLiquidity).toBe(3);
    expect(full.operatingEfficiency).toBe(2);
  });

  it('treats missing shares as null (not failure)', () => {
    const curNoShares = { ...cur, sharesOutstanding: null };
    const prevNoShares = { ...prev, sharesOutstanding: null };
    const r = PiotroskiEngine.evaluate(set(curNoShares, prevNoShares));
    const criterion = r.criteria.find((c) => c.id === 'no_share_issuance')!;
    expect(criterion.passed).toBeNull();
    expect(criterion.dataAvailable).toBe(false);
    expect(r.maxAvailable).toBe(8);
    expect(r.total).toBe(8);
  });
});

describe('ValuationIntelligenceEngine', () => {
  const cur = fact(2023, { revenue: 1000, netProfit: 100, cfo: 500, capex: 100, totalEquity: 10000, totalLiabilities: 5000, cash: 1000, sharesOutstanding: 100 });
  const facts = set(cur);
  const config = { ...DEFAULT_CONFIG, targetPE: 15, targetPB: 1.8, wacc: 0.10, terminalGrowth: 0.03 };

  const v = ValuationIntelligenceEngine.evaluate({
    facts,
    price: 100,
    peers: [{ pe: 12, pb: 2, evEbitda: 8 }],
    config,
    historicalPE: [10, 11, 12, 13],
    historicalFCF: [400],
  });

  it('computes P/E fair value = normalized EPS * targetPE', () => {
    // EPS = 100/100 = 1 → 1 * 15 = 15
    expect(v.peFairValue).toBe(15);
  });
  it('computes P/E multiple', () => {
    expect(v.pe).toBe(100); // price 100 / eps 1
  });
  it('computes DCF fair value > 0 (valid inputs)', () => {
    expect(v.dcfFairValue).not.toBeNull();
    expect(v.dcfFairValue!).toBeGreaterThan(0);
  });
  it('computes margin of safety from fair value vs price', () => {
    expect(v.marginOfSafety).not.toBeNull();
  });
});

describe('ScenarioEngine', () => {
  const sc = ScenarioEngine.evaluate({
    eps: 10,
    currentPrice: 100,
    revenueCAGR: 10,
    netMargin: 15,
    config: DEFAULT_CONFIG,
  });
  it('keeps bull >= base >= bear', () => {
    expect(sc.consistent).toBe(true);
    expect(sc.bull.fairValue!).toBeGreaterThanOrEqual(sc.base.fairValue!);
    expect(sc.base.fairValue!).toBeGreaterThanOrEqual(sc.bear.fairValue!);
  });
  it('probabilities sum to 100%', () => {
    const sum = sc.bull.probability + sc.base.probability + sc.bear.probability;
    expect(sum).toBeCloseTo(1.0, 4);
  });
  it('computes probability-weighted expected value', () => {
    expect(sc.expectedValue).not.toBeNull();
    const manual = sc.bull.fairValue! * sc.bull.probability + sc.base.fairValue! * sc.base.probability + sc.bear.fairValue! * sc.bear.probability;
    expect(sc.expectedValue!).toBeCloseTo(manual, 1);
  });
});

describe('EnterpriseScoreEngine', () => {
  it('weights sum to 100', () => {
    const w = EnterpriseScoreEngine.WEIGHTS;
    const sum = w.businessQuality + w.growth + w.profitability + w.financialHealth + w.earningsQuality + w.valuation + w.competitive + w.marketTechnical + w.riskAdjustment;
    expect(sum).toBe(100);
  });

  it('keeps total within 0..100 for any valid input', () => {
    const r = EnterpriseScoreEngine.evaluate({
      businessQuality: 80, growth: 70, profitability: 60, financialHealth: 50,
      earningsQuality: 40, valuation: 30, competitive: 20, marketTechnical: 10,
      riskLevel: 'LOW',
    });
    expect(r.total).not.toBeNull();
    expect(r.total!).toBeGreaterThanOrEqual(0);
    expect(r.total!).toBeLessThanOrEqual(100);
  });

  it('returns null total when no categories available', () => {
    const r = EnterpriseScoreEngine.evaluate({
      businessQuality: null, growth: null, profitability: null, financialHealth: null,
      earningsQuality: null, valuation: null, competitive: null, marketTechnical: null,
      riskLevel: null,
    });
    expect(r.total).toBeNull();
  });
});

describe('DataCompletenessEngine', () => {
  it('reports 100% + HIGH when all metrics present', () => {
    const r = DataCompletenessEngine.evaluate({
      financialPeriods: 4,
      marketDataAvailable: true,
      metrics: { revenue: true, netProfit: true, totalAssets: true, cfo: true, price: true },
    });
    expect(r.completeness).toBe(100);
    expect(r.confidence).toBe('HIGH');
  });
  it('reports MEDIUM/LOW when sparse', () => {
    const r = DataCompletenessEngine.evaluate({
      financialPeriods: 1,
      marketDataAvailable: false,
      metrics: { revenue: true, netProfit: false, totalAssets: false, cfo: false, price: false },
    });
    expect(r.completeness).toBeLessThan(50);
    expect(r.confidence).toBe('LOW');
  });
});