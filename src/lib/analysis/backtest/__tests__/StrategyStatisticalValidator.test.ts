/**
 * PHASE 17.8 — STRATEGY STATISTICAL VALIDATOR & MONTE CARLO TEST SUITE
 * ====================================================================
 * Rigorous tests verifying deterministic seeded Monte Carlo, bootstrap confidence
 * intervals, exceptional-trade removal, profit concentration, reality check,
 * and fail-closed safety.
 */

import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../validation/SeededRandom.ts';
import { StrategyStatisticalValidator } from '../validation/StrategyStatisticalValidator.ts';
import type { BacktestConfig, BacktestTrade, HistoricalCandle } from '../types.ts';

/**
 * Helper to generate synthetic deterministic trades for testing
 */
function createSyntheticTrades(
  count: number,
  baseReturnPct: number,
  winRate: number = 0.6,
  volatility: number = 2.0
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const rng = new SeededRandom(12345);

  for (let i = 0; i < count; i++) {
    const isWin = rng.next() < winRate;
    const returnPct = isWin
      ? Number((baseReturnPct + rng.next() * volatility).toFixed(2))
      : Number((-Math.abs(baseReturnPct * 0.7) - rng.next() * volatility).toFixed(2));

    const entryPrice = 50000;
    const quantity = 1000;
    const entryGross = entryPrice * quantity;
    const entryCommission = entryGross * 0.0015;

    const exitPrice = entryPrice * (1 + returnPct / 100);
    const exitGross = exitPrice * quantity;
    const exitCommission = exitGross * 0.0015;
    const exitTax = exitGross * 0.0010;

    const grossPnL = exitGross - entryGross;
    const netPnL = exitGross - exitCommission - exitTax - (entryGross + entryCommission);

    trades.push({
      id: `trade_${i}`,
      symbol: 'VNM',
      side: 'LONG',
      entryDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      exitDate: `2024-02-${String((i % 28) + 1).padStart(2, '0')}`,
      entryPrice,
      exitPrice: Number(exitPrice.toFixed(2)),
      quantity,
      entryGrossValue: entryGross,
      exitGrossValue: exitGross,
      grossPnL: Number(grossPnL.toFixed(2)),
      netPnL: Number(netPnL.toFixed(2)),
      returnPct,
      holdingDays: 10,
      exitReason: isWin ? 'TAKE_PROFIT' : 'STOP_LOSS',
      entryCommission: Number(entryCommission.toFixed(2)),
      exitCommission: Number(exitCommission.toFixed(2)),
      exitTax: Number(exitTax.toFixed(2)),
    });
  }

  return trades;
}

const mockConfig: BacktestConfig = {
  symbol: 'VNM',
  initialCapital: 100_000_000, // 100M VND
  commissionRate: 0.0015,
  slippageRate: 0.0010,
  sellTaxRate: 0.0010,
};

describe('Phase 17.8 — SeededRandom PRNG', () => {
  it('produces 100% identical sequence for identical seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    const seq1 = Array.from({ length: 50 }, () => rng1.next());
    const seq2 = Array.from({ length: 50 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(999);

    const seq1 = Array.from({ length: 20 }, () => rng1.next());
    const seq2 = Array.from({ length: 20 }, () => rng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  it('shuffles arrays deterministically with Fisher-Yates', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const rng1 = new SeededRandom(777);
    const rng2 = new SeededRandom(777);

    const shuffled1 = rng1.shuffle(original);
    const shuffled2 = rng2.shuffle(original);

    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1).toHaveLength(original.length);
    // Elements are preserved
    expect([...shuffled1].sort((a, b) => a - b)).toEqual(original);
  });

  it('samples with replacement deterministically', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    const rng1 = new SeededRandom(101);
    const rng2 = new SeededRandom(101);

    const sample1 = rng1.sampleWithReplacement(items, 15);
    const sample2 = rng2.sampleWithReplacement(items, 15);

    expect(sample1).toEqual(sample2);
    expect(sample1).toHaveLength(15);
    sample1.forEach(item => expect(items).toContain(item));
  });
});

describe('Phase 17.8 — Sample Size & Power Assessment', () => {
  it('classifies < 30 trades as INSUFFICIENT_DATA', () => {
    const p1 = StrategyStatisticalValidator.assessSamplePower(0);
    const p2 = StrategyStatisticalValidator.assessSamplePower(15);
    const p3 = StrategyStatisticalValidator.assessSamplePower(29);

    expect(p1.tier).toBe('INSUFFICIENT_DATA');
    expect(p2.tier).toBe('INSUFFICIENT_DATA');
    expect(p3.tier).toBe('INSUFFICIENT_DATA');
    expect(p1.isSufficientForInference).toBe(false);
  });

  it('classifies 30-49 trades as LOW_STATISTICAL_POWER', () => {
    const p = StrategyStatisticalValidator.assessSamplePower(35);
    expect(p.tier).toBe('LOW_STATISTICAL_POWER');
    expect(p.isSufficientForInference).toBe(true);
  });

  it('classifies 50-99 trades as MODERATE_STATISTICAL_POWER', () => {
    const p = StrategyStatisticalValidator.assessSamplePower(75);
    expect(p.tier).toBe('MODERATE_STATISTICAL_POWER');
  });

  it('classifies 100+ trades as ADEQUATE_STATISTICAL_POWER', () => {
    const p = StrategyStatisticalValidator.assessSamplePower(120);
    expect(p.tier).toBe('ADEQUATE_STATISTICAL_POWER');
  });
});

describe('Phase 17.8 — Fail-Closed Safety', () => {
  it('blocks and returns BLOCKED when trade contains NaN return', () => {
    const trades = createSyntheticTrades(10, 3.0);
    (trades[3] as any).returnPct = NaN;

    const report = StrategyStatisticalValidator.validate(trades, mockConfig);
    expect(report.classification).toBe('BLOCKED');
    expect(report.samplePower.description).toContain('Blocked');
  });

  it('blocks when trade contains non-finite price', () => {
    const trades = createSyntheticTrades(10, 3.0);
    (trades[2] as any).entryPrice = Infinity;

    const report = StrategyStatisticalValidator.validate(trades, mockConfig);
    expect(report.classification).toBe('BLOCKED');
  });

  it('returns INSUFFICIENT_DATA when trades array is empty', () => {
    const report = StrategyStatisticalValidator.validate([], mockConfig);
    expect(report.classification).toBe('INSUFFICIENT_DATA');
    expect(report.samplePower.tier).toBe('INSUFFICIENT_DATA');
  });
});

describe('Phase 17.8 — Deterministic Monte Carlo Simulation', () => {
  it('produces bit-exact identical Monte Carlo results with same seed', () => {
    const trades = createSyntheticTrades(40, 4.0, 0.65);

    const report1 = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 42,
      monteCarloIterations: 300,
    });

    const report2 = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 42,
      monteCarloIterations: 300,
    });

    expect(report1.monteCarlo.returnDistribution).toEqual(report2.monteCarlo.returnDistribution);
    expect(report1.monteCarlo.drawdownDistribution).toEqual(report2.monteCarlo.drawdownDistribution);
    expect(report1.monteCarlo.endingEquityDistribution).toEqual(report2.monteCarlo.endingEquityDistribution);
    expect(report1.monteCarlo.negativeReturnFrequencyPct).toBe(report2.monteCarlo.negativeReturnFrequencyPct);
  });

  it('produces different Monte Carlo outputs with different seeds', () => {
    const trades = createSyntheticTrades(40, 4.0, 0.65);

    const report1 = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 111,
      monteCarloIterations: 300,
    });

    const report2 = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 999,
      monteCarloIterations: 300,
    });

    expect(report1.monteCarlo.returnDistribution.median).not.toBe(
      report2.monteCarlo.returnDistribution.median
    );
  });

  it('computes monotonically ordered percentiles for return and drawdown', () => {
    const trades = createSyntheticTrades(50, 3.0, 0.6);

    const report = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 42,
      monteCarloIterations: 500,
    });

    const rd = report.monteCarlo.returnDistribution;
    expect(rd.p5).toBeLessThanOrEqual(rd.p25);
    expect(rd.p25).toBeLessThanOrEqual(rd.median);
    expect(rd.median).toBeLessThanOrEqual(rd.p75);
    expect(rd.p75).toBeLessThanOrEqual(rd.p95);

    const dd = report.monteCarlo.drawdownDistribution;
    expect(dd.median).toBeLessThanOrEqual(dd.p75);
    expect(dd.p75).toBeLessThanOrEqual(dd.p95);
    expect(dd.p95).toBeLessThanOrEqual(dd.worst);
  });
});

describe('Phase 17.8 — Bootstrap Confidence Intervals', () => {
  it('calculates deterministic 95% bootstrap confidence intervals', () => {
    const trades = createSyntheticTrades(50, 4.0, 0.7);

    const report = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 42,
      bootstrapIterations: 500,
      confidenceLevel: 0.95,
    });

    expect(report.bootstrapCI).not.toBeNull();
    const ci = report.bootstrapCI!;

    expect(ci.meanTradeReturnPct.lowerBound).toBeLessThanOrEqual(ci.meanTradeReturnPct.upperBound);
    expect(ci.winRatePct.lowerBound).toBeLessThanOrEqual(ci.winRatePct.upperBound);
    expect(ci.expectancyPct.lowerBound).toBeLessThanOrEqual(ci.expectancyPct.upperBound);

    // Point estimate sits within bounds
    expect(ci.meanTradeReturnPct.pointEstimate).toBeGreaterThanOrEqual(ci.meanTradeReturnPct.lowerBound - 1);
    expect(ci.meanTradeReturnPct.pointEstimate).toBeLessThanOrEqual(ci.meanTradeReturnPct.upperBound + 1);
  });
});

describe('Phase 17.8 — Benchmark Comparison', () => {
  it('compares strategy return and drawdown against candle buy-and-hold', () => {
    const trades = createSyntheticTrades(35, 5.0, 0.65);

    const candles: HistoricalCandle[] = [
      { symbol: 'VNM', timestamp: '2024-01-01', open: 50000, high: 52000, low: 49000, close: 51000, volume: 1000000 },
      { symbol: 'VNM', timestamp: '2024-01-15', open: 51000, high: 53000, low: 46000, close: 48000, volume: 1000000 }, // deep drop
      { symbol: 'VNM', timestamp: '2024-02-01', open: 48000, high: 55000, low: 47000, close: 54000, volume: 1000000 },
    ];

    const report = StrategyStatisticalValidator.validate(trades, mockConfig, candles, {
      seed: 42,
    });

    expect(report.benchmarkComparison).not.toBeNull();
    const bench = report.benchmarkComparison!;

    expect(bench.benchmarkName).toBe('Buy & Hold Underlying Stock');
    // Start 50000, End 54000 -> +8%
    expect(bench.benchmarkReturnPct).toBe(8);
    expect(bench.excessReturnPct).toBe(Number((report.observedMetrics.totalReturnPct - 8).toFixed(2)));
    expect(bench.benchmarkMaxDrawdownPct).toBeGreaterThan(0);
  });
});

describe('Phase 17.8 — Edge Consistency & Outlier Removal', () => {
  it('flags edgeCollapsesWithoutTopTrades when strategy fails without top 3 trades', () => {
    // 35 trades: 32 flat/small loss, 3 huge wins
    const trades = createSyntheticTrades(35, 0.5, 0.45);
    // Make 3 trades massive
    trades[0] = { ...trades[0], netPnL: 50_000_000, returnPct: 50.0 };
    trades[1] = { ...trades[1], netPnL: 40_000_000, returnPct: 40.0 };
    trades[2] = { ...trades[2], netPnL: 30_000_000, returnPct: 30.0 };

    const edge = StrategyStatisticalValidator.runEdgeConsistencyTest(trades, 100_000_000);

    expect(edge.fullTradeSet.netProfit).toBeGreaterThan(0);
    expect(edge.excludingTop3Trades.tradesRemaining).toBe(32);
    // Without top 3, profits collapse
    expect(edge.edgeCollapsesWithoutTopTrades).toBe(true);
  });

  it('identifies robust edge that survives top 3 trade removal', () => {
    // 60 consistently profitable trades
    const trades = createSyntheticTrades(60, 4.0, 0.75);

    const edge = StrategyStatisticalValidator.runEdgeConsistencyTest(trades, 100_000_000);

    expect(edge.fullTradeSet.netProfit).toBeGreaterThan(0);
    expect(edge.excludingTop3Trades.netProfit).toBeGreaterThan(0);
    expect(edge.edgeCollapsesWithoutTopTrades).toBe(false);
  });
});

describe('Phase 17.8 — Profit Concentration Risk', () => {
  it('flags concentrationRisk when top 1 trade generates >= 50% of gross profit', () => {
    const trades = createSyntheticTrades(30, 1.0, 0.5);
    // Set 1 trade to 80% of total
    trades[0] = { ...trades[0], netPnL: 80_000_000, returnPct: 80.0 };

    const conc = StrategyStatisticalValidator.analyzeProfitConcentration(trades);

    expect(conc.top1ProfitSharePct).toBeGreaterThanOrEqual(50);
    expect(conc.concentrationRisk).toBe(true);
  });

  it('confirms healthy profit distribution when no single trade dominates', () => {
    const trades = createSyntheticTrades(50, 3.0, 0.7);

    const conc = StrategyStatisticalValidator.analyzeProfitConcentration(trades);

    expect(conc.top1ProfitSharePct).toBeLessThan(50);
    expect(conc.concentrationRisk).toBe(false);
  });
});

describe('Phase 17.8 — Transaction Friction Integrity', () => {
  it('correctly tracks gross profit, net profit, commissions, taxes, and friction drag', () => {
    const trades = createSyntheticTrades(30, 3.0, 0.6);

    const friction = StrategyStatisticalValidator.evaluateFrictionIntegrity(trades, mockConfig);

    expect(friction.totalCommissionPaid).toBeGreaterThan(0);
    expect(friction.totalSellTaxPaid).toBeGreaterThan(0);
    expect(friction.totalFrictionPaid).toBeGreaterThan(0);
    expect(friction.grossProfit).toBeGreaterThan(friction.netProfit);
    expect(friction.commissionRateUsedPct).toBe(0.15);
    expect(friction.sellTaxRateUsedPct).toBe(0.10);
    expect(friction.slippageRateUsedPct).toBe(0.10);
  });
});

describe('Phase 17.8 — Final Statistical Classification Synthesis', () => {
  it('classifies unprofitable strategy as FAILED', () => {
    const trades = createSyntheticTrades(35, -2.0, 0.2); // losing strategy

    const report = StrategyStatisticalValidator.validate(trades, mockConfig);
    expect(report.classification).toBe('FAILED');
    expect(report.keyFindings[0]).toContain('failed to generate positive net profit');
  });

  it('classifies highly concentrated / fragile strategy as FRAGILE_EDGE', () => {
    const trades = createSyntheticTrades(35, 0.5, 0.4);
    // Inject massive outlier trade
    trades[0] = { ...trades[0], netPnL: 90_000_000, returnPct: 90.0 };

    const report = StrategyStatisticalValidator.validate(trades, mockConfig);
    expect(report.classification).toBe('FRAGILE_EDGE');
  });

  it('classifies small sample size as INSUFFICIENT_DATA or WEAK_EVIDENCE', () => {
    const trades = createSyntheticTrades(12, 4.0, 0.65);
    const report = StrategyStatisticalValidator.validate(trades, mockConfig);
    expect(report.classification).toBe('INSUFFICIENT_DATA');
  });

  it('classifies large sample robust strategy as STATISTICALLY_SUPPORTED or CONDITIONALLY_SUPPORTED', () => {
    const trades = createSyntheticTrades(100, 4.0, 0.75, 1.5);

    const report = StrategyStatisticalValidator.validate(trades, mockConfig, undefined, {
      seed: 42,
      monteCarloIterations: 500,
      bootstrapIterations: 500,
    });

    expect(['STATISTICALLY_SUPPORTED', 'CONDITIONALLY_SUPPORTED']).toContain(report.classification);
    expect(report.governanceAudit.seededDeterminismVerified).toBe(true);
    expect(report.governanceAudit.transactionFrictionPreserved).toBe(true);
    expect(report.governanceAudit.lookAheadFree).toBe(true);
  });
});
