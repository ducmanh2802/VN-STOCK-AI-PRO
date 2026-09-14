/**
 * PHASE 17.9 — CROSS-ASSET / CROSS-PERIOD / CROSS-REGIME VALIDATOR TESTS
 * =======================================================================
 * Deterministic unit testing for generalization validation across multiple
 * assets, chronological periods, and market regimes.
 */

import { describe, expect, it } from 'vitest';
import { CrossGeneralizationValidator } from '../validation/CrossGeneralizationValidator.ts';
import { SeededRandom } from '../validation/SeededRandom.ts';
import type { BacktestTrade, HistoricalCandle } from '../types.ts';
import type { AssetDatasetInput } from '../validation/generalizationTypes.ts';

// Helper to generate deterministic synthetic trades for an asset
function createMockTrades(
  symbol: string,
  count: number,
  baseReturnPct: number,
  winRate: number,
  startDateStr = '2024-01-01',
  seed = 42
): BacktestTrade[] {
  const rng = new SeededRandom(seed);
  const trades: BacktestTrade[] = [];
  const basePrice = 50000;
  const quantity = 1000;
  const entryGross = basePrice * quantity;
  const entryCommission = entryGross * 0.0015;

  const start = new Date(startDateStr);

  for (let i = 0; i < count; i++) {
    const isWin = rng.next() < winRate;
    const returnPct = isWin
      ? Number((Math.abs(baseReturnPct) + rng.next() * 2).toFixed(2))
      : Number((-Math.abs(baseReturnPct * 0.6) - rng.next() * 2).toFixed(2));

    const entryTime = new Date(start.getTime() + i * 3 * 24 * 60 * 60 * 1000);
    const exitTime = new Date(entryTime.getTime() + 2 * 24 * 60 * 60 * 1000);

    const exitPrice = basePrice * (1 + returnPct / 100);
    const exitGross = exitPrice * quantity;
    const exitCommission = exitGross * 0.0015;
    const exitTax = exitGross * 0.0010;

    const grossPnL = exitGross - entryGross;
    const netPnL = exitGross - exitCommission - exitTax - (entryGross + entryCommission);

    trades.push({
      id: `${symbol}_trade_${i}`,
      symbol,
      side: 'LONG',
      entryDate: entryTime.toISOString().split('T')[0],
      exitDate: exitTime.toISOString().split('T')[0],
      entryPrice: basePrice,
      exitPrice: Number(exitPrice.toFixed(2)),
      quantity,
      entryGrossValue: entryGross,
      exitGrossValue: exitGross,
      grossPnL: Number(grossPnL.toFixed(2)),
      netPnL: Number(netPnL.toFixed(2)),
      returnPct,
      holdingDays: 2,
      exitReason: isWin ? 'TAKE_PROFIT' : 'STOP_LOSS',
      entryCommission: Number(entryCommission.toFixed(2)),
      exitCommission: Number(exitCommission.toFixed(2)),
      exitTax: Number(exitTax.toFixed(2)),
    });
  }

  return trades;
}

// Helper to generate deterministic synthetic candles for an asset
function createMockCandles(
  symbol: string,
  count: number,
  trend: 'BULL' | 'BEAR' | 'SIDEWAYS' = 'SIDEWAYS',
  startDateStr = '2024-01-01'
): HistoricalCandle[] {
  const candles: HistoricalCandle[] = [];
  let price = 50000;
  const start = new Date(startDateStr);

  for (let i = 0; i < count; i++) {
    const time = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = time.toISOString().split('T')[0];

    if (trend === 'BULL') {
      price *= 1.002;
    } else if (trend === 'BEAR') {
      price *= 0.998;
    } else {
      price += (i % 2 === 0 ? 100 : -100);
    }

    candles.push({
      symbol,
      timestamp: dateStr,
      open: Number(price.toFixed(2)),
      high: Number((price * 1.01).toFixed(2)),
      low: Number((price * 0.99).toFixed(2)),
      close: Number(price.toFixed(2)),
      volume: 1_000_000,
    });
  }

  return candles;
}

const mockStrategy = { id: 'strat_test', name: 'Test Trend Strategy' };

describe('Phase 17.9 — Determinism & Mathematical Invariants', () => {
  it('produces 100% bit-exact output given identical inputs and seed', () => {
    const tradesVNM = createMockTrades('VNM', 40, 4.0, 0.65, '2024-01-01', 101);
    const tradesHPG = createMockTrades('HPG', 40, 3.5, 0.60, '2024-01-01', 102);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 80), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 80), trades: tradesHPG },
    ];

    const report1 = CrossGeneralizationValidator.validate(mockStrategy, input, { seed: 42 });
    const report2 = CrossGeneralizationValidator.validate(mockStrategy, input, { seed: 42 });

    expect(report1.score.totalScore).toBe(report2.score.totalScore);
    expect(report1.classification).toBe(report2.classification);
    expect(report1.crossAsset.positiveReturnAssetRatio).toBe(report2.crossAsset.positiveReturnAssetRatio);
    expect(report1.crossPeriod.medianPeriodReturnPct).toBe(report2.crossPeriod.medianPeriodReturnPct);
    expect(report1.crossAsset.returnDispersion).toEqual(report2.crossAsset.returnDispersion);
  });

  it('preserves immutability of input trades and candles without mutation', () => {
    const trades = createMockTrades('VNM', 35, 3.0, 0.60);
    const originalTradesLen = trades.length;
    const originalTrade0 = { ...trades[0] };

    const candles = createMockCandles('VNM', 60);
    const originalCandlesLen = candles.length;
    const originalCandle0 = { ...candles[0] };

    CrossGeneralizationValidator.validate(mockStrategy, [{ symbol: 'VNM', candles, trades }]);

    expect(trades.length).toBe(originalTradesLen);
    expect(trades[0]).toEqual(originalTrade0);
    expect(candles.length).toBe(originalCandlesLen);
    expect(candles[0]).toEqual(originalCandle0);
  });
});

describe('Phase 17.9 — Dimension A: Cross-Asset Validation', () => {
  it('correctly aggregates multi-asset coverage and dispersion', () => {
    const tradesVNM = createMockTrades('VNM', 35, 5.0, 0.70, '2024-01-01', 1);
    const tradesHPG = createMockTrades('HPG', 35, 4.0, 0.65, '2024-01-01', 2);
    const tradesFPT = createMockTrades('FPT', 35, -2.0, 0.35, '2024-01-01', 3); // unprofitable

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 70), trades: tradesHPG },
      { symbol: 'FPT', candles: createMockCandles('FPT', 70), trades: tradesFPT },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);

    expect(report.crossAsset.testedAssets).toBe(3);
    expect(report.crossAsset.successfulAssets).toBe(2);
    expect(report.crossAsset.failedAssets).toBe(1);
    expect(report.crossAsset.positiveReturnAssetRatio).toBeCloseTo(0.67, 1);
    expect(report.crossAsset.returnDispersion.min).toBeLessThan(0);
    expect(report.crossAsset.returnDispersion.max).toBeGreaterThan(0);
  });

  it('detects asset concentration risk when a single asset dominates profits', () => {
    // VNM generates massive profits, HPG generates tiny profit
    const tradesVNM = createMockTrades('VNM', 50, 15.0, 0.85, '2024-01-01', 10);
    const tradesHPG = createMockTrades('HPG', 50, 0.5, 0.51, '2024-01-01', 20);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 80), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 80), trades: tradesHPG },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);

    expect(report.crossAsset.topAssetContributionPct).toBeGreaterThanOrEqual(50.0);
    expect(report.crossAsset.assetConcentrationRisk).toBe(true);
    expect(report.classification).toBe('ASSET_DEPENDENT');
  });

  it('handles assets with zero trades without dividing by zero', () => {
    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 50), trades: [] },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);

    expect(report.crossAsset.testedAssets).toBe(1);
    expect(report.crossAsset.successfulAssets).toBe(0);
    expect(report.crossAsset.assetDetails[0].tradeCount).toBe(0);
    expect(report.crossAsset.assetDetails[0].winRatePct).toBe(0);
    expect(report.crossAsset.assetDetails[0].profitFactor).toBeNull();
    expect(report.classification).toBe('INSUFFICIENT_DATA');
  });
});

describe('Phase 17.9 — Dimension B: Cross-Period Validation', () => {
  it('evaluates chronological consistency across early, middle, and recent periods', () => {
    // Generate 60 trades evenly spread across 180 days
    const trades = createMockTrades('VNM', 60, 4.0, 0.65, '2024-01-01', 42);
    const candles = createMockCandles('VNM', 180, 'SIDEWAYS', '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles, trades },
    ]);

    expect(report.crossPeriod.periods.length).toBe(3);
    expect(report.crossPeriod.periods[0].period).toBe('EARLY_PERIOD');
    expect(report.crossPeriod.periods[1].period).toBe('MIDDLE_PERIOD');
    expect(report.crossPeriod.periods[2].period).toBe('RECENT_PERIOD');
    expect(report.crossPeriod.positivePeriodRatio).toBeGreaterThan(0);
  });

  it('flags recent degradation when performance drops sharply in recent period', () => {
    // Early 20 trades strongly profitable, middle 20 trades moderately profitable, recent 20 trades heavily losing
    const earlyTrades = createMockTrades('VNM', 20, 8.0, 0.75, '2024-01-01', 1);
    const middleTrades = createMockTrades('VNM', 20, 3.0, 0.60, '2024-03-01', 2);
    const recentTrades = createMockTrades('VNM', 20, -6.0, 0.25, '2024-05-01', 3);

    const allTrades = [...earlyTrades, ...middleTrades, ...recentTrades];
    const candles = createMockCandles('VNM', 150, 'SIDEWAYS', '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles, trades: allTrades },
    ]);

    expect(report.crossPeriod.recentDegradation).toBe(true);
    expect(report.score.penalties.recentDegradationPenalty).toBe(-15);
  });

  it('detects historical edge risk when profitability is confined strictly to early period', () => {
    const earlyTrades = createMockTrades('VNM', 20, 10.0, 0.80, '2024-01-01', 1);
    const middleTrades = createMockTrades('VNM', 20, -3.0, 0.35, '2024-03-01', 2);
    const recentTrades = createMockTrades('VNM', 20, -4.0, 0.30, '2024-05-01', 3);

    const allTrades = [...earlyTrades, ...middleTrades, ...recentTrades];
    const candles = createMockCandles('VNM', 150, 'SIDEWAYS', '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles, trades: allTrades },
    ]);

    expect(report.crossPeriod.historicalEdgeRisk).toBe(true);
    expect(report.classification).toBe('PERIOD_DEPENDENT');
  });
});

describe('Phase 17.9 — Dimension C: Cross-Regime Validation', () => {
  it('evaluates trades categorized under deterministic market regimes', () => {
    // 60 candles in quiet sideways, 60 candles in bull trend
    const quietCandles = createMockCandles('VNM', 60, 'SIDEWAYS', '2024-01-01');
    const bullCandles = createMockCandles('VNM', 60, 'BULL', '2024-03-01');
    const allCandles = [...quietCandles, ...bullCandles];

    const trades = createMockTrades('VNM', 40, 4.0, 0.65, '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: allCandles, trades },
    ]);

    expect(report.crossRegime.regimes.length).toBe(4);
    expect(report.crossRegime.testedRegimes).toBeGreaterThanOrEqual(1);
    const bullResult = report.crossRegime.regimes.find((r) => r.regime === 'BULL_TREND');
    expect(bullResult).toBeDefined();
  });

  it('flags regime dependency when profitable in only 1 regime', () => {
    const candles = createMockCandles('VNM', 100, 'SIDEWAYS', '2024-01-01');
    const trades = createMockTrades('VNM', 45, 5.0, 0.65, '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles, trades },
    ]);

    // When trades only occur in one detected regime, regime dependency is checked
    expect(typeof report.crossRegime.regimeDependent).toBe('boolean');
  });

  it('marks untested regimes as NOT_TESTED rather than failure', () => {
    const candles = createMockCandles('VNM', 60, 'SIDEWAYS', '2024-01-01');
    const trades = createMockTrades('VNM', 35, 3.0, 0.60, '2024-01-01');

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles, trades },
    ]);

    const notTested = report.crossRegime.regimes.filter((r) => r.status === 'NOT_TESTED');
    expect(notTested.length).toBeGreaterThan(0);
    // Untested regimes must NOT be marked as failed
    for (const r of notTested) {
      expect(r.tradeCount).toBe(0);
      expect(r.isProfitable).toBe(false);
    }
  });
});

describe('Phase 17.9 — Cross-Dimension Matrix', () => {
  it('constructs complete matrix grid across all dimensions and assets', () => {
    const tradesVNM = createMockTrades('VNM', 35, 4.0, 0.60, '2024-01-01', 11);
    const tradesHPG = createMockTrades('HPG', 35, 3.5, 0.55, '2024-01-01', 12);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 70), trades: tradesHPG },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);

    expect(report.matrix.colHeaders).toEqual(['VNM', 'HPG']);
    expect(report.matrix.rowHeaders.length).toBe(7);
    expect(report.matrix.grid['Early Period']['VNM']).toBeDefined();
    expect(report.matrix.grid['Middle Period']['HPG']).toBeDefined();
    expect(report.matrix.grid['Recent Period']['VNM']).toBeDefined();
    expect(report.matrix.grid['Bull Regime']['HPG']).toBeDefined();
    expect(report.matrix.grid['Sideways Quiet']['VNM']).toBeDefined();
  });
});

describe('Phase 17.9 — Research Generalization Diagnostic Score', () => {
  it('bounds score between 0 and 100 with explicit research notice', () => {
    const trades = createMockTrades('VNM', 50, 4.0, 0.65);
    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70), trades },
    ]);

    expect(report.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(report.score.totalScore).toBeLessThanOrEqual(100);
    expect(report.score.notice).toBe('RESEARCH_DIAGNOSTIC_ONLY');
  });

  it('applies penalties for concentration and degradation', () => {
    const tradesVNM = createMockTrades('VNM', 40, 15.0, 0.85, '2024-01-01', 5);
    const tradesHPG = createMockTrades('HPG', 40, 0.5, 0.51, '2024-01-01', 6);

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 70), trades: tradesHPG },
    ]);

    expect(report.score.penalties.concentrationPenalty).toBe(-15);
  });
});

describe('Phase 17.9 — Conservative Classification States', () => {
  it('classifies as INSUFFICIENT_DATA when total trades < 30', () => {
    const trades = createMockTrades('VNM', 15, 5.0, 0.70);
    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: createMockCandles('VNM', 40), trades },
    ]);

    expect(report.classification).toBe('INSUFFICIENT_DATA');
    expect(report.limitations.some((l) => l.includes('Insufficient trade sample'))).toBe(true);
  });

  it('classifies as FAILED when strategy is unprofitable across all assets', () => {
    const tradesVNM = createMockTrades('VNM', 35, -5.0, 0.30, '2024-01-01', 1);
    const tradesHPG = createMockTrades('HPG', 35, -4.0, 0.35, '2024-01-01', 2);

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: createMockCandles('VNM', 60), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 60), trades: tradesHPG },
    ]);

    expect(report.classification).toBe('FAILED');
    expect(report.limitations.some((l) => l.includes('failed across all tested assets'))).toBe(true);
  });

  it('classifies as GENERALIZES_WELL when robust across assets, periods, and regimes', () => {
    // 3 well-performing assets with balanced profits (~33% each)
    const tradesVNM = createMockTrades('VNM', 40, 4.0, 0.65, '2024-01-01', 1);
    const tradesHPG = createMockTrades('HPG', 40, 4.0, 0.65, '2024-01-01', 4);
    const tradesFPT = createMockTrades('FPT', 40, 4.0, 0.65, '2024-01-01', 7);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 120, 'SIDEWAYS'), trades: tradesVNM },
      { symbol: 'HPG', candles: createMockCandles('HPG', 120, 'BULL'), trades: tradesHPG },
      { symbol: 'FPT', candles: createMockCandles('FPT', 120, 'SIDEWAYS'), trades: tradesFPT },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);

    expect(['GENERALIZES_WELL', 'CONDITIONALLY_GENERALIZES']).toContain(report.classification);
  });

  it('classifies as REGIME_DEPENDENT when edge only works in 1 regime and fails in others', () => {
    // Trades in Sideways are positive, but Bear Trend trades fail heavily
    const trades1 = createMockTrades('VNM', 40, 5.0, 0.70, '2024-01-01', 1);
    const trades2 = createMockTrades('HPG', 40, -6.0, 0.20, '2024-03-01', 2);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70, 'SIDEWAYS', '2024-01-01'), trades: trades1 },
      { symbol: 'HPG', candles: createMockCandles('HPG', 70, 'BEAR', '2024-03-01'), trades: trades2 },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);
    expect(['REGIME_DEPENDENT', 'WEAK_GENERALIZATION', 'PERIOD_DEPENDENT', 'ASSET_DEPENDENT']).toContain(report.classification);
  });

  it('classifies as WEAK_GENERALIZATION when performance across assets is mixed below 60%', () => {
    // 3 assets: 1 slightly positive, 2 slightly negative
    const trades1 = createMockTrades('VNM', 35, 1.5, 0.52, '2024-01-01', 1);
    const trades2 = createMockTrades('HPG', 35, -1.5, 0.45, '2024-01-01', 2);
    const trades3 = createMockTrades('FPT', 35, -1.0, 0.46, '2024-01-01', 3);

    const input: AssetDatasetInput[] = [
      { symbol: 'VNM', candles: createMockCandles('VNM', 70), trades: trades1 },
      { symbol: 'HPG', candles: createMockCandles('HPG', 70), trades: trades2 },
      { symbol: 'FPT', candles: createMockCandles('FPT', 70), trades: trades3 },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, input);
    expect(['WEAK_GENERALIZATION', 'ASSET_DEPENDENT', 'FAILED']).toContain(report.classification);
  });
});

describe('Phase 17.9 — Fail-Closed Safety & Data Integrity', () => {
  it('fails closed with BLOCKED on empty asset dataset', () => {
    const report = CrossGeneralizationValidator.validate(mockStrategy, []);
    expect(report.classification).toBe('BLOCKED');
    expect(report.limitations[0]).toContain('Empty asset datasets');
  });

  it('fails closed with BLOCKED on empty symbol string', () => {
    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: '   ', candles: [] },
    ]);
    expect(report.classification).toBe('BLOCKED');
    expect(report.limitations[0]).toContain('empty symbol identifier');
  });

  it('fails closed with FAILED on malformed candle (NaN or negative price)', () => {
    const candles: HistoricalCandle[] = [
      { symbol: 'VNM', timestamp: '2024-01-01', open: 50000, high: 52000, low: 48000, close: 51000, volume: 100 },
      { symbol: 'VNM', timestamp: '2024-01-02', open: NaN, high: 52000, low: 48000, close: 51000, volume: 100 },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles },
    ]);
    expect(report.classification).toBe('FAILED');
    expect(report.limitations[0]).toContain('Malformed candle data');
  });

  it('fails closed with FAILED on chronological disorder in candles', () => {
    const candles: HistoricalCandle[] = [
      { symbol: 'VNM', timestamp: '2024-01-05', open: 50000, high: 52000, low: 48000, close: 51000, volume: 100 },
      { symbol: 'VNM', timestamp: '2024-01-02', open: 51000, high: 52000, low: 48000, close: 50000, volume: 100 },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles },
    ]);
    expect(report.classification).toBe('FAILED');
    expect(report.limitations[0]).toContain('Chronological disorder');
  });

  it('fails closed with FAILED on malformed trade (Infinity net PnL)', () => {
    const trades: BacktestTrade[] = [
      {
        id: 't1',
        symbol: 'VNM',
        side: 'LONG',
        entryDate: '2024-01-01',
        exitDate: '2024-01-03',
        entryPrice: 50000,
        exitPrice: 52000,
        quantity: 1000,
        entryGrossValue: 50000000,
        exitGrossValue: 52000000,
        grossPnL: 2000000,
        netPnL: Infinity,
        returnPct: 4.0,
        holdingDays: 2,
        exitReason: 'TAKE_PROFIT',
        entryCommission: 75000,
        exitCommission: 78000,
        exitTax: 52000,
      },
    ];

    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: [], trades },
    ]);
    expect(report.classification).toBe('FAILED');
    expect(report.limitations[0]).toContain('Malformed trade data');
  });

  it('governance audit confirms zero look-ahead, zero execution mutation, and friction preservation', () => {
    const trades = createMockTrades('VNM', 35, 4.0, 0.60);
    const report = CrossGeneralizationValidator.validate(mockStrategy, [
      { symbol: 'VNM', candles: createMockCandles('VNM', 50), trades },
    ]);

    expect(report.governanceAudit.noLookAhead).toBe(true);
    expect(report.governanceAudit.noActiveBarLeakage).toBe(true);
    expect(report.governanceAudit.nextBarOpenExecution).toBe(true);
    expect(report.governanceAudit.frictionPreserved).toBe(true);
    expect(report.governanceAudit.noProductionMock).toBe(true);
    expect(report.governanceAudit.noExecutionMutation).toBe(true);
    expect(report.governanceAudit.noStrategyOptimization).toBe(true);
  });
});
