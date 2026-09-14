/**
 * PHASE 17.10 — STRATEGY ACCEPTANCE GATE & RESEARCH CERTIFICATION TEST SUITE
 * ============================================================================
 * Comprehensive verification of the quantitative research certification gate.
 * 
 * Test Coverage:
 *   1. Governance invariants (QG-01 to QG-10, fail-closed blocking)
 *   2. Statistical evidence & sample size adequacy (>= 30 trades)
 *   3. Anti-overfitting, OOS stability, and friction resilience
 *   4. Cross-asset, cross-period, and cross-regime generalization
 *   5. Multi-dimensional decision hierarchy (BLOCKED -> REJECTED -> INSUFFICIENT -> CONDITIONAL -> CERTIFIED)
 *   6. Deterministic SHA-256 fingerprinting and canonical serialization invariance
 *   7. Frozen baseline immutability and drift detection
 *   8. Anti-slop: diagnostic scores cannot override hard controls
 */

import { describe, it, expect } from 'vitest';
import { StrategyAcceptanceGate } from '../validation/StrategyAcceptanceGate.ts';
import type {
  StrategyAcceptanceGateInput,
  StrategyFingerprintInput,
  MandatoryGovernanceAudit,
} from '../validation/acceptanceTypes.ts';
import type { StrategyRobustnessReport } from '../validation/types.ts';
import type { StrategyStatisticalReport } from '../validation/statisticalTypes.ts';
import type { CrossGeneralizationReport } from '../validation/generalizationTypes.ts';
import { PaperBroker } from '../../../trading/paper/PaperBroker.ts';
import { PaperTradeLedger } from '../../../trading/paper/PaperTradeLedger.ts';

describe('Phase 17.10 — Strategy Acceptance Gate & Research Certification', () => {
  // ---------------------------------------------------------------------------
  // Canonical Test Fixtures & Builders
  // ---------------------------------------------------------------------------
  const buildCleanGovernanceAudit = (): MandatoryGovernanceAudit => ({
    lookAheadFree: true,
    activeBarIsolated: true,
    nextOpenExecution: true,
    deterministicReproducibility: true,
    strategyContractValid: true,
    backtestIsolatedFromPaper: true,
    zeroMockContamination: true,
    riskPipelinePreserved: true,
    financialStateConserved: true,
    marketDataSanityVerified: true,
  });

  const buildCleanAntiOverfittingReport = (overrides?: Partial<StrategyRobustnessReport>): StrategyRobustnessReport => ({
    strategyId: 'TREND_FOLLOWING_V1',
    strategyName: 'Trend Following Dual EMA',
    symbol: 'SSI',
    datasetSummary: {
      totalBars: 500,
      fromDate: '2024-01-01',
      toDate: '2025-12-31',
    },
    chronologicalSplit: {
      trainCandles: [],
      validationCandles: [],
      testCandles: [],
      isChronologicallyValid: true,
      totalBars: 500,
      dateRange: {
        trainStart: '2024-01-01',
        trainEnd: '2024-12-31',
        valStart: null,
        valEnd: null,
        testStart: '2025-01-01',
        testEnd: '2025-12-31',
      },
    },
    oosComparison: {
      inSampleMetrics: { totalReturnPct: 24.5 } as any,
      outOfSampleMetrics: { totalReturnPct: 18.2 } as any,
      returnDegradationPct: 6.3,
      winRateDeltaPct: -2.0,
      isOosProfitable: true,
      isOosDegraded: false,
      degradationRatio: 0.74,
    },
    walkForward: {
      windows: [],
      aggregateOosReturnPct: 18.5,
      aggregateOosWinRatePct: 56.0,
      profitableWindowRatio: 0.8,
      isWalkForwardStable: true,
    },
    frictionStress: {
      scenarios: [],
      survivesBaseFriction: true,
      survivesHighSlippage: true,
      isFrictionFragile: false,
      totalFrictionDragPct: 4.5,
    },
    parameterSensitivity: {
      perturbations: [],
      overallParameterStability: true,
      overfitRiskFlag: false,
    },
    regimeRobustness: {
      regimes: [],
      dominantRegime: 'BULL_TREND',
      isProfitableInBull: true,
      isProfitableInBear: false,
      isProfitableInSideways: true,
      isRegimeDependent: false,
    },
    distributionAnalysis: {
      totalTrades: 65,
      winningTrades: 38,
      losingTrades: 27,
      medianReturnPct: 1.8,
      worstTradeReturnPct: -4.5,
      bestTradeReturnPct: 9.2,
      maxConsecutiveLosses: 3,
      top3ProfitSharePct: 35.0,
      concentrationRiskFlag: false,
    },
    sampleSize: {
      totalTrades: 65,
      classification: 'HIGH_CONFIDENCE',
      description: 'Robust sample size (65 trades >= 30)',
    },
    verdict: 'ROBUST',
    warnings: [],
    recommendations: [],
    deterministicAudit: {
      evaluatedAtTimestamp: '2026-01-01T00:00:00Z',
      executionTimingVerified: true,
      lookAheadChecked: true,
      isolationVerified: true,
    },
    ...overrides,
  });

  const buildCleanStatisticalReport = (overrides?: Partial<StrategyStatisticalReport>): StrategyStatisticalReport => ({
    strategyId: 'TREND_FOLLOWING_V1',
    strategyName: 'Trend Following Dual EMA',
    symbol: 'SSI',
    evaluationTimestamp: '2026-01-01T00:00:00Z',
    samplePower: {
      sampleSize: 65,
      tier: 'MODERATE_STATISTICAL_POWER',
      description: 'Adequate power (65 trades)',
      isSufficientForInference: true,
    },
    observedMetrics: {
      totalTrades: 65,
      totalReturnPct: 22.4,
      netProfit: 22400000,
      meanTradeReturnPct: 0.38,
      medianTradeReturnPct: 0.25,
      standardDeviationPct: 1.85,
      winRatePct: 58.46,
      profitFactor: 1.85,
      maxDrawdownPct: 8.4,
      expectancyPct: 0.42,
      bestTradeReturnPct: 9.2,
      worstTradeReturnPct: -4.5,
      maxConsecutiveLosses: 3,
      totalCommissionPaid: 1500000,
      totalTaxPaid: 1000000,
    },
    riskAdjusted: {
      sharpeRatio: 1.45,
      sortinoRatio: 2.1,
      calmarRatio: 2.66,
      annualRiskFreeRatePct: 4.5,
      riskFreeRateAssumptionDocumented: 'SBV 4.5% rate',
    },
    monteCarlo: {
      iterations: 1000,
      seed: 42,
      initialCapital: 100000000,
      returnDistribution: { median: 21.5, mean: 22.0, p5: 8.5, p25: 16.0, p75: 28.0, p95: 36.5 },
      drawdownDistribution: { median: 9.0, p75: 11.2, p95: 14.8, worst: 18.0 },
      endingEquityDistribution: { median: 121500000, p5: 108500000, p95: 136500000 },
      consecutiveLossDistribution: { median: 4, p95: 7, worst: 9 },
      negativeReturnFrequencyPct: 1.2,
      severeDrawdownFrequencies: {
        pMddExceeds10Pct: 22.5,
        pMddExceeds20Pct: 0.2,
        pMddExceeds30Pct: 0.0,
      },
      orderPermutationSensitivity: {
        baselineMddPct: 8.4,
        medianPermutedMddPct: 9.0,
        p95PermutedMddPct: 14.8,
        worstPermutedMddPct: 18.0,
        mddSpreadPct: 9.6,
        sequenceInstabilityFlag: false,
      },
    },
    bootstrapCI: {
      confidenceLevelPct: 95,
      iterations: 1000,
      seed: 42,
      meanTradeReturnPct: { metricName: 'Mean Return', pointEstimate: 0.38, lowerBound: 0.12, upperBound: 0.65, confidenceLevelPct: 95, spansZero: false },
      winRatePct: { metricName: 'Win Rate', pointEstimate: 58.46, lowerBound: 48.0, upperBound: 69.0, confidenceLevelPct: 95, spansZero: false },
      expectancyPct: { metricName: 'Expectancy', pointEstimate: 0.42, lowerBound: 0.15, upperBound: 0.70, confidenceLevelPct: 95, spansZero: false },
      profitFactor: null,
    },
    benchmarkComparison: null,
    edgeConsistency: {
      fullTradeSet: {} as any,
      excludingBestTrade: {} as any,
      excludingTop3Trades: {} as any,
      excludingWorstTrade: {} as any,
      edgeCollapsesWithoutTopTrades: false,
      returnReductionExcludingTop3Pct: 15.0,
    },
    profitConcentration: {
      totalNetProfit: 22400000,
      totalGrossProfit: 24900000,
      top1ProfitSharePct: 17.4,
      top3ProfitSharePct: 36.6,
      top5ProfitSharePct: 48.2,
      concentrationRisk: false,
      diagnosticNote: 'Low concentration',
    },
    multipleTesting: {
      status: 'RECORDED',
      testedStrategyCount: 5,
      advisoryWarning: 'None',
    },
    realityCheck: {
      status: 'SIGNIFICANT_EDGE_EVIDENCE',
      observedReturnPct: 22.4,
      nullDistributionMedianPct: 2.1,
      empiricalPercentileRank: 98.5,
      empiricalPValue: 0.015,
      statisticalWarningStatus: 'CONFIRMED',
    },
    frictionIntegrity: {
      isNetProfitable: true,
      totalFrictionPaid: 2500000,
      frictionDragPct: 10.0,
    } as any,
    classification: 'STATISTICALLY_SUPPORTED',
    keyFindings: ['Statistically significant edge verified.'],
    limitations: [],
    governanceAudit: {
      lookAheadFree: true,
      transactionFrictionPreserved: true,
      seededDeterminismVerified: true,
      executionTimingIsolated: true,
      noProductionMocks: true,
    },
    ...overrides,
  });

  const buildCleanGeneralizationReport = (overrides?: Partial<CrossGeneralizationReport>): CrossGeneralizationReport => ({
    strategyId: 'TREND_FOLLOWING_V1',
    strategyName: 'Trend Following Dual EMA',
    crossAsset: {
      testedAssets: 3,
      successfulAssets: 3,
      failedAssets: 0,
      positiveReturnAssetRatio: 1.0,
      positiveExpectancyAssetRatio: 1.0,
      profitableAssetRatio: 1.0,
    } as any,
    crossPeriod: {
      periods: [],
      positivePeriodRatio: 1.0,
      periodDependent: false,
    } as any,
    crossRegime: {
      regimes: [],
      testedRegimes: 3,
      adequatelySampledRegimes: 3,
      positiveRegimeRatio: 1.0,
      regimeDependent: false,
      regimeFailure: false,
      dominantRegime: 'BULL_TREND',
    },
    matrix: {
      rowHeaders: [],
      colHeaders: ['SSI', 'VNM', 'HPG'],
      grid: {},
    },
    score: {
      totalScore: 88,
      assetCoverageScore: 28,
      periodConsistencyScore: 22,
      regimeCoverageScore: 20,
      statisticalPowerScore: 18,
      penalties: {
        concentrationPenalty: 0,
        recentDegradationPenalty: 0,
        regimeFailurePenalty: 0,
      },
      notice: 'RESEARCH_DIAGNOSTIC_ONLY',
    },
    classification: 'GENERALIZES_WELL',
    keyFindings: ['Strong generalization observed across tested liquid assets.'],
    limitations: [],
    governanceAudit: {
      noLookAhead: true,
      noActiveBarLeakage: true,
      nextBarOpenExecution: true,
      deterministicValidation: true,
      frictionPreserved: true,
      noProductionMock: true,
      noExecutionMutation: true,
      noStrategyOptimization: true,
    },
    ...overrides,
  });

  const buildBaseGateInput = (): StrategyAcceptanceGateInput => ({
    strategyId: 'TREND_FOLLOWING_V1',
    strategyName: 'Trend Following Dual EMA',
    strategyVersion: '1.0.0',
    methodologyVersion: '17.10.0',
    strategyParameters: {
      fastPeriod: 10,
      slowPeriod: 30,
      stopLossPct: 0.05,
    },
    datasetIdentity: {
      symbol: 'SSI',
      totalBars: 500,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
    },
    frictionAssumptions: {
      commissionRate: 0.0015,
      sellTaxRate: 0.0010,
      slippageRate: 0.0010,
      boardLot: 100,
    },
    governanceAudit: buildCleanGovernanceAudit(),
    antiOverfittingReport: buildCleanAntiOverfittingReport(),
    statisticalReport: buildCleanStatisticalReport(),
    generalizationReport: buildCleanGeneralizationReport(),
    validationScope: {
      testedSymbols: ['SSI', 'VNM', 'HPG'],
      testedPeriods: ['EARLY_PERIOD', 'MIDDLE_PERIOD', 'RECENT_PERIOD'],
      testedRegimes: ['BULL_TREND', 'SIDEWAYS_VOLATILE'],
    },
    evaluationTimestamp: '2026-01-01T00:00:00.000Z',
  });

  // ===========================================================================
  // CATEGORY 1: Quantitative Governance Invariants & Fail-Closed Blocking
  // ===========================================================================
  describe('1. Governance Invariants (QG-01 to QG-10)', () => {
    it('passes and certifies when all 10 governance requirements and empirical standards pass', () => {
      const input = buildBaseGateInput();
      const cert = StrategyAcceptanceGate.evaluate(input);

      expect(cert.certificationStatus).toBe('CERTIFIED');
      expect(cert.governanceStatus).toBe('PASS');
      expect(cert.certifiedBaseline).not.toBeNull();
      expect(cert.failedChecks.length).toBe(0);
      expect(cert.mandatoryChecks.every((c) => c.passed)).toBe(true);
    });

    it('blocks immediately (BLOCKED) if QG-01 (look-ahead bias) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).lookAheadFree = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.governanceStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-01'))).toBe(true);
    });

    it('blocks immediately if QG-02 (active-bar isolation) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).activeBarIsolated = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-02'))).toBe(true);
    });

    it('blocks immediately if QG-03 (next-open execution) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).nextOpenExecution = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-03'))).toBe(true);
    });

    it('blocks immediately if QG-04 (deterministic reproducibility) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).deterministicReproducibility = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-04'))).toBe(true);
    });

    it('blocks immediately if QG-06 (paper trading state isolation) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).backtestIsolatedFromPaper = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-06'))).toBe(true);
    });

    it('blocks immediately if QG-07 (zero mock contamination) fails', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).zeroMockContamination = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('QG-07'))).toBe(true);
    });

    it('blocks immediately on negative or invalid friction parameters', () => {
      const input = buildBaseGateInput();
      (input.frictionAssumptions as any).commissionRate = -0.01;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.mandatoryChecks.some((c) => c.checkId === 'INPUT_FRICTION_SANITY' && !c.passed)).toBe(true);
    });

    it('blocks immediately if dataset identity contains reversed chronological dates', () => {
      const input = buildBaseGateInput();
      (input.datasetIdentity as any).startDate = '2026-01-01';
      (input.datasetIdentity as any).endDate = '2024-01-01'; // Inverted!

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.mandatoryChecks.some((c) => c.checkId === 'INPUT_DATASET_SANITY' && !c.passed)).toBe(true);
    });

    it('blocks if upstream statistical or generalization report has status BLOCKED', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({ classification: 'BLOCKED' });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((c) => c.includes('STATISTICAL_BLOCKED'))).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY 2: Statistical Significance & Sample Size Adequacy
  // ===========================================================================
  describe('2. Statistical Evidence & Sample Adequacy', () => {
    it('returns INSUFFICIENT_EVIDENCE if total trades < 30', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        samplePower: {
          sampleSize: 18,
          tier: 'INSUFFICIENT_DATA',
          description: 'Insufficient sample',
          isSufficientForInference: false,
        },
        observedMetrics: {
          ...buildCleanStatisticalReport().observedMetrics,
          totalTrades: 18,
        },
      });
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        distributionAnalysis: {
          ...buildCleanAntiOverfittingReport().distributionAnalysis,
          totalTrades: 18,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('INSUFFICIENT_EVIDENCE');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.warnings.some((w) => w.includes('INSUFFICIENT_TRADES'))).toBe(true);
    });

    it('rejects (REJECTED) if net profit or total return is <= 0', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        observedMetrics: {
          ...buildCleanStatisticalReport().observedMetrics,
          netProfit: -500000,
          totalReturnPct: -0.5,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((f) => f.includes('NEGATIVE_NET_PROFIT'))).toBe(true);
    });

    it('rejects (REJECTED) if edge collapses when excluding top outlier trades', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        edgeConsistency: {
          ...buildCleanStatisticalReport().edgeConsistency,
          edgeCollapsesWithoutTopTrades: true,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((f) => f.includes('EDGE_COLLAPSE_WITHOUT_TOP_TRADES'))).toBe(true);
    });

    it('rejects (REJECTED) if reality check confirms edge is indistinguishable from random noise', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        samplePower: {
          sampleSize: 80,
          tier: 'MODERATE_STATISTICAL_POWER',
          description: 'Adequate sample',
          isSufficientForInference: true,
        },
        realityCheck: {
          status: 'INCONCLUSIVE_NOISE',
          observedReturnPct: 5.0,
          nullDistributionMedianPct: 4.5,
          empiricalPercentileRank: 55.0,
          empiricalPValue: 0.45,
          statisticalWarningStatus: 'NO_EDGE',
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.certifiedBaseline).toBeNull();
      expect(cert.failedChecks.some((f) => f.includes('REALITY_CHECK_NULL_HYPOTHESIS'))).toBe(true);
    });

    it('grants CONDITIONALLY_CERTIFIED if sample has low statistical power (30-49 trades)', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        samplePower: {
          sampleSize: 38,
          tier: 'LOW_STATISTICAL_POWER',
          description: 'Low power (38 trades)',
          isSufficientForInference: true,
        },
        observedMetrics: {
          ...buildCleanStatisticalReport().observedMetrics,
          totalTrades: 38,
        },
      });
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        distributionAnalysis: {
          ...buildCleanAntiOverfittingReport().distributionAnalysis,
          totalTrades: 38,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.certifiedBaseline).not.toBeNull();
      expect(cert.certifiedBaseline?.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.conditionalChecks.some((c) => c.includes('LOW_STATISTICAL_POWER'))).toBe(true);
    });

    it('grants CONDITIONALLY_CERTIFIED if bootstrap CI lower bound spans zero', () => {
      const input = buildBaseGateInput();
      input.statisticalReport = buildCleanStatisticalReport({
        bootstrapCI: {
          confidenceLevelPct: 95,
          iterations: 1000,
          seed: 42,
          meanTradeReturnPct: { metricName: 'Mean Return', pointEstimate: 0.25, lowerBound: -0.05, upperBound: 0.60, confidenceLevelPct: 95, spansZero: true },
          winRatePct: { metricName: 'Win Rate', pointEstimate: 52.0, lowerBound: 42.0, upperBound: 62.0, confidenceLevelPct: 95, spansZero: false },
          expectancyPct: { metricName: 'Expectancy', pointEstimate: 0.20, lowerBound: -0.02, upperBound: 0.50, confidenceLevelPct: 95, spansZero: true },
          profitFactor: null,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.conditionalChecks.some((c) => c.includes('BOOTSTRAP_CI_SPANS_ZERO'))).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY 3: Anti-Overfitting, OOS Stability & Friction Resilience
  // ===========================================================================
  describe('3. Anti-Overfitting & Friction Resilience', () => {
    it('rejects (REJECTED) if out-of-sample performance collapses (isOosDegraded)', () => {
      const input = buildBaseGateInput();
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        oosComparison: {
          inSampleMetrics: { totalReturnPct: 35.0 } as any,
          outOfSampleMetrics: { totalReturnPct: -8.5 } as any,
          returnDegradationPct: 43.5,
          winRateDeltaPct: -25.0,
          isOosProfitable: false,
          isOosDegraded: true,
          degradationRatio: -0.24,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.failedChecks.some((f) => f.includes('OOS_DEGRADATION'))).toBe(true);
    });

    it('rejects (REJECTED) if strategy is fragile under realistic friction', () => {
      const input = buildBaseGateInput();
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        frictionStress: {
          scenarios: [],
          survivesBaseFriction: false,
          survivesHighSlippage: false,
          isFrictionFragile: true,
          totalFrictionDragPct: 28.0,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.failedChecks.some((f) => f.includes('FRICTION_FRAGILE'))).toBe(true);
    });

    it('rejects (REJECTED) if parameter sensitivity reveals an overfit cliff', () => {
      const input = buildBaseGateInput();
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        parameterSensitivity: {
          perturbations: [],
          overallParameterStability: false,
          overfitRiskFlag: true,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.failedChecks.some((f) => f.includes('PARAMETER_OVERFIT_CLIFF'))).toBe(true);
    });

    it('grants CONDITIONALLY_CERTIFIED if strategy survives base friction but collapses under extreme slippage', () => {
      const input = buildBaseGateInput();
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        frictionStress: {
          scenarios: [],
          survivesBaseFriction: true,
          survivesHighSlippage: false, // Under extreme 0.50% slippage
          isFrictionFragile: false,
          totalFrictionDragPct: 6.0,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.conditionalChecks.some((c) => c.includes('HIGH_SLIPPAGE_VULNERABILITY'))).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY 4: Cross-Asset, Cross-Period & Cross-Regime Generalization
  // ===========================================================================
  describe('4. Cross-Dimensional Generalization', () => {
    it('grants CONDITIONALLY_CERTIFIED when generalization is REGIME_DEPENDENT', () => {
      const input = buildBaseGateInput();
      input.generalizationReport = buildCleanGeneralizationReport({
        classification: 'REGIME_DEPENDENT',
        crossRegime: {
          regimes: [],
          testedRegimes: 3,
          adequatelySampledRegimes: 3,
          positiveRegimeRatio: 0.33,
          regimeDependent: true,
          regimeFailure: false,
          dominantRegime: 'BULL_TREND',
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.conditionalChecks.some((c) => c.includes('REGIME_DEPENDENT'))).toBe(true);
      expect(cert.limitations.some((l) => l.includes('REGIME_DEPENDENCE'))).toBe(true);
    });

    it('grants CONDITIONALLY_CERTIFIED when generalization is ASSET_DEPENDENT', () => {
      const input = buildBaseGateInput();
      input.generalizationReport = buildCleanGeneralizationReport({
        classification: 'ASSET_DEPENDENT',
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('CONDITIONALLY_CERTIFIED');
      expect(cert.conditionalChecks.some((c) => c.includes('ASSET_DEPENDENT'))).toBe(true);
    });

    it('rejects (REJECTED) if strategy is unprofitable across all tested assets (0% profitable assets)', () => {
      const input = buildBaseGateInput();
      input.generalizationReport = buildCleanGeneralizationReport({
        classification: 'FAILED',
        crossAsset: {
          testedAssets: 3,
          successfulAssets: 0,
          failedAssets: 3,
          positiveReturnAssetRatio: 0.0,
          positiveExpectancyAssetRatio: 0.0,
          profitableAssetRatio: 0.0,
        } as any,
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('REJECTED');
      expect(cert.failedChecks.some((f) => f.includes('ZERO_ASSET_GENERALIZATION'))).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY 5: Anti-Slop Discipline: Diagnostic Score Cannot Override Hard Controls
  // ===========================================================================
  describe('5. Diagnostic Score Discipline', () => {
    it('does NOT certify a strategy with a high diagnostic score (95/100) if trade count is insufficient', () => {
      const input = buildBaseGateInput();
      // High score in 17.9: 95
      input.generalizationReport = buildCleanGeneralizationReport({
        score: {
          totalScore: 95,
          assetCoverageScore: 30,
          periodConsistencyScore: 25,
          regimeCoverageScore: 22,
          statisticalPowerScore: 18,
          penalties: { concentrationPenalty: 0, recentDegradationPenalty: 0, regimeFailurePenalty: 0 },
          notice: 'RESEARCH_DIAGNOSTIC_ONLY',
        },
      });
      // But trades < 30
      input.statisticalReport = buildCleanStatisticalReport({
        samplePower: {
          sampleSize: 12,
          tier: 'INSUFFICIENT_DATA',
          description: 'Insufficient trades',
          isSufficientForInference: false,
        },
        observedMetrics: {
          ...buildCleanStatisticalReport().observedMetrics,
          totalTrades: 12,
        },
      });
      input.antiOverfittingReport = buildCleanAntiOverfittingReport({
        distributionAnalysis: {
          ...buildCleanAntiOverfittingReport().distributionAnalysis,
          totalTrades: 12,
        },
      });

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.researchDiagnosticScore).toBe(95);
      expect(cert.certificationStatus).toBe('INSUFFICIENT_EVIDENCE'); // Score CANNOT override sample power!
      expect(cert.certifiedBaseline).toBeNull();
    });

    it('does NOT certify a strategy with a score of 90/100 if look-ahead governance invariant failed', () => {
      const input = buildBaseGateInput();
      (input.governanceAudit as any).lookAheadFree = false;

      const cert = StrategyAcceptanceGate.evaluate(input);
      expect(cert.certificationStatus).toBe('BLOCKED');
      expect(cert.certifiedBaseline).toBeNull();
    });
  });

  // ===========================================================================
  // CATEGORY 6: Deterministic Fingerprinting & Canonical Invariance
  // ===========================================================================
  describe('6. Deterministic SHA-256 Fingerprint & Canonical Invariance', () => {
    it('produces identical bit-exact fingerprint on identical inputs', () => {
      const input1 = buildBaseGateInput();
      const input2 = buildBaseGateInput();

      const fp1 = StrategyAcceptanceGate.computeFingerprint(input1);
      const fp2 = StrategyAcceptanceGate.computeFingerprint(input2);

      expect(fp1).toBe(fp2);
      expect(fp1.startsWith('FPR_')).toBe(true);
      expect(fp1.length).toBe(68); // 'FPR_' + 64 hex characters
    });

    it('produces identical fingerprint regardless of JavaScript object property insertion order', () => {
      const base = buildBaseGateInput();

      const inputA: StrategyFingerprintInput = {
        strategyId: 'ALPHA',
        strategyName: 'Alpha Strategy',
        strategyVersion: '1.0.0',
        methodologyVersion: '17.10.0',
        strategyParameters: { b: 2, a: 1, c: 3 },
        datasetIdentity: { symbol: 'SSI', totalBars: 100, startDate: '2024-01-01', endDate: '2024-12-31' },
        frictionAssumptions: { commissionRate: 0.0015, sellTaxRate: 0.0010, slippageRate: 0.0010 },
      };

      const inputB: StrategyFingerprintInput = {
        // Different property insertion order
        methodologyVersion: '17.10.0',
        frictionAssumptions: { slippageRate: 0.0010, commissionRate: 0.0015, sellTaxRate: 0.0010 },
        strategyParameters: { c: 3, a: 1, b: 2 },
        strategyVersion: '1.0.0',
        datasetIdentity: { endDate: '2024-12-31', startDate: '2024-01-01', totalBars: 100, symbol: 'SSI' },
        strategyName: 'Alpha Strategy',
        strategyId: 'ALPHA',
      };

      const fpA = StrategyAcceptanceGate.computeFingerprint(inputA);
      const fpB = StrategyAcceptanceGate.computeFingerprint(inputB);

      expect(fpA).toBe(fpB);
    });

    it('changes fingerprint when any strategy parameter is modified', () => {
      const base = buildBaseGateInput();
      const fp1 = StrategyAcceptanceGate.computeFingerprint(base);

      const modified = {
        ...base,
        strategyParameters: {
          ...base.strategyParameters,
          fastPeriod: 12, // changed from 10
        },
      };
      const fp2 = StrategyAcceptanceGate.computeFingerprint(modified);

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when friction assumptions are modified', () => {
      const base = buildBaseGateInput();
      const fp1 = StrategyAcceptanceGate.computeFingerprint(base);

      const modified = {
        ...base,
        frictionAssumptions: {
          ...base.frictionAssumptions,
          slippageRate: 0.0020, // changed from 0.0010
        },
      };
      const fp2 = StrategyAcceptanceGate.computeFingerprint(modified);

      expect(fp1).not.toBe(fp2);
    });

    it('changes fingerprint when dataset identity is modified', () => {
      const base = buildBaseGateInput();
      const fp1 = StrategyAcceptanceGate.computeFingerprint(base);

      const modified = {
        ...base,
        datasetIdentity: {
          ...base.datasetIdentity,
          totalBars: 600, // changed from 500
        },
      };
      const fp2 = StrategyAcceptanceGate.computeFingerprint(modified);

      expect(fp1).not.toBe(fp2);
    });
  });

  // ===========================================================================
  // CATEGORY 7: Frozen Baseline Immutability & Drift Detection
  // ===========================================================================
  describe('7. Frozen Research Baseline & Drift Detection', () => {
    it('generates an immutable frozen baseline with status CERTIFIED', () => {
      const input = buildBaseGateInput();
      const cert = StrategyAcceptanceGate.evaluate(input);

      expect(cert.certifiedBaseline).not.toBeNull();
      const baseline = cert.certifiedBaseline!;

      expect(Object.isFrozen(baseline)).toBe(true);
      expect(Object.isFrozen(baseline.parameters)).toBe(true);
      expect(Object.isFrozen(baseline.frictionModel)).toBe(true);
      expect(Object.isFrozen(baseline.validationSummary)).toBe(true);
      expect(baseline.certificationStatus).toBe('CERTIFIED');
      expect(baseline.strategyId).toBe('TREND_FOLLOWING_V1');
      expect(baseline.validationSummary.governanceVerdict).toBe('PASS');
    });

    it('verifies baseline integrity correctly when configuration is identical (VALID)', () => {
      const input = buildBaseGateInput();
      const cert = StrategyAcceptanceGate.evaluate(input);
      const baseline = cert.certifiedBaseline!;

      const integrity = StrategyAcceptanceGate.verifyBaselineIntegrity(baseline, input);
      expect(integrity.isValid).toBe(true);
      expect(integrity.status).toBe('VALID');
      expect(integrity.driftReasons.length).toBe(0);
      expect(integrity.currentFingerprint).toBe(baseline.baselineFingerprint);
    });

    it('detects parameter drift and triggers REQUIRES_REVALIDATION', () => {
      const input = buildBaseGateInput();
      const cert = StrategyAcceptanceGate.evaluate(input);
      const baseline = cert.certifiedBaseline!;

      const driftedConfig: StrategyFingerprintInput = {
        ...input,
        strategyParameters: {
          ...input.strategyParameters,
          fastPeriod: 15, // Modified!
        },
      };

      const integrity = StrategyAcceptanceGate.verifyBaselineIntegrity(baseline, driftedConfig);
      expect(integrity.isValid).toBe(false);
      expect(integrity.status).toBe('REQUIRES_REVALIDATION');
      expect(integrity.driftReasons.some((r) => r.includes("fastPeriod"))).toBe(true);
    });

    it('detects friction model drift and triggers REQUIRES_REVALIDATION', () => {
      const input = buildBaseGateInput();
      const cert = StrategyAcceptanceGate.evaluate(input);
      const baseline = cert.certifiedBaseline!;

      const driftedConfig: StrategyFingerprintInput = {
        ...input,
        frictionAssumptions: {
          ...input.frictionAssumptions,
          commissionRate: 0.0020, // Modified from 0.0015!
        },
      };

      const integrity = StrategyAcceptanceGate.verifyBaselineIntegrity(baseline, driftedConfig);
      expect(integrity.isValid).toBe(false);
      expect(integrity.status).toBe('REQUIRES_REVALIDATION');
      expect(integrity.driftReasons.some((r) => r.includes("Commission rate modified"))).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY 8: Downstream Execution Isolation
  // ===========================================================================
  describe('8. Downstream Execution Isolation', () => {
    it('executes acceptance gate without mutating PaperBroker or PaperTradeLedger state', async () => {
      const broker = new PaperBroker({ initialCash: 100000000 });
      const initialCash = broker.getAccount().cash;
      const initialOrders = await broker.getAllOrders();

      const ledger = new PaperTradeLedger();
      const initialLedgerEntries = ledger.getAllEntries().length;

      // Run multiple evaluations through the gate
      const input = buildBaseGateInput();
      StrategyAcceptanceGate.evaluate(input);
      StrategyAcceptanceGate.computeFingerprint(input);

      // Verify zero execution side-effects
      expect(broker.getAccount().cash).toBe(initialCash);
      const currentOrders = await broker.getAllOrders();
      expect(currentOrders.length).toBe(initialOrders.length);
      expect(ledger.getAllEntries().length).toBe(initialLedgerEntries);
    });
  });
});
