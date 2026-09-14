/**
 * PHASE 17.10 — STRATEGY ACCEPTANCE GATE & RESEARCH CERTIFICATION
 * =================================================================
 * Deterministic quantitative research-governance gate.
 * 
 * Determines whether an already-tested strategy has sufficient empirical and
 * architectural evidence to become a CERTIFIED RESEARCH BASELINE.
 * 
 * NON-NEGOTIABLE GOVERNANCE RULES:
 *   - Research infrastructure only — no live execution, order placement, or broker coupling.
 *   - Fail-closed evaluation hierarchy: HARD_BLOCKERS -> REJECTION -> INSUFFICIENT -> CONDITIONAL -> CERTIFIED.
 *   - 100% deterministic: bit-exact reproducibility, canonical object serialization, SHA-256 fingerprinting.
 *   - Diagnostic score cannot independently certify or override failed hard controls.
 */

import { sha256, canonicalSerialize } from '../../../trading/snapshot/snapshotHash.ts';
import type {
  CertifiedStrategyBaseline,
  MandatoryCheckResult,
  MandatoryGovernanceAudit,
  BaselineIntegrityResult,
  StrategyAcceptanceGateInput,
  StrategyCertification,
  StrategyCertificationStatus,
  StrategyFingerprintInput,
} from './acceptanceTypes.ts';

export class StrategyAcceptanceGate {
  public static readonly GATE_VERSION = '17.10.0';

  /**
   * Computes a deterministic, bit-exact SHA-256 fingerprint representing
   * the strategy's research identity.
   *
   * Canonical keys included:
   *   - strategyId, strategyName, strategyVersion
   *   - strategyParameters
   *   - methodologyVersion
   *   - frictionAssumptions (commission, tax, slippage, boardLot)
   *   - datasetIdentity (symbol, totalBars, startDate, endDate, dataHash)
   *   - validationScope (sorted symbols, periods, regimes)
   */
  public static computeFingerprint(input: StrategyFingerprintInput): string {
    const canonicalPayload = {
      datasetIdentity: {
        endDate: input.datasetIdentity.endDate,
        startDate: input.datasetIdentity.startDate,
        symbol: input.datasetIdentity.symbol,
        totalBars: input.datasetIdentity.totalBars,
        ...(input.datasetIdentity.dataHash ? { dataHash: input.datasetIdentity.dataHash } : {}),
      },
      frictionAssumptions: {
        boardLot: input.frictionAssumptions.boardLot ?? 100,
        commissionRate: input.frictionAssumptions.commissionRate,
        sellTaxRate: input.frictionAssumptions.sellTaxRate,
        slippageRate: input.frictionAssumptions.slippageRate,
      },
      methodologyVersion: input.methodologyVersion,
      strategyId: input.strategyId,
      strategyName: input.strategyName,
      strategyParameters: input.strategyParameters,
      strategyVersion: input.strategyVersion,
      validationScope: {
        testedPeriods: input.validationScope?.testedPeriods ? [...input.validationScope.testedPeriods].sort() : [],
        testedRegimes: input.validationScope?.testedRegimes ? [...input.validationScope.testedRegimes].sort() : [],
        testedSymbols: input.validationScope?.testedSymbols ? [...input.validationScope.testedSymbols].sort() : [],
      },
    };

    const serialized = canonicalSerialize(canonicalPayload);
    const digest = sha256(serialized);
    return `FPR_${digest}`;
  }

  /**
   * Evaluates a strategy against all Phase 17 governance invariants and empirical evidence.
   */
  public static evaluate(input: StrategyAcceptanceGateInput): StrategyCertification {
    const mandatoryChecks: MandatoryCheckResult[] = [];
    const conditionalChecks: string[] = [];
    const failedChecks: string[] = [];
    const warnings: string[] = [];
    const limitations: string[] = [];

    // Deterministic timestamp: use explicit override or derive from dataset end date
    const evaluatedAt = input.evaluationTimestamp || `${input.datasetIdentity.endDate}T15:00:00.000Z`;

    // -------------------------------------------------------------------------
    // STEP 1: Compute Deterministic Fingerprint
    // -------------------------------------------------------------------------
    const fingerprint = this.computeFingerprint(input);

    // -------------------------------------------------------------------------
    // STEP 2: Input Integrity & Data Sanity Checks
    // -------------------------------------------------------------------------
    const isFrictionValid =
      Number.isFinite(input.frictionAssumptions.commissionRate) &&
      input.frictionAssumptions.commissionRate >= 0 &&
      Number.isFinite(input.frictionAssumptions.sellTaxRate) &&
      input.frictionAssumptions.sellTaxRate >= 0 &&
      Number.isFinite(input.frictionAssumptions.slippageRate) &&
      input.frictionAssumptions.slippageRate >= 0;

    mandatoryChecks.push({
      checkId: 'INPUT_FRICTION_SANITY',
      name: 'Friction Assumptions Sanity',
      dimension: 'DATA_INTEGRITY',
      passed: isFrictionValid,
      isHardBlocker: true,
      details: isFrictionValid
        ? `Comm: ${input.frictionAssumptions.commissionRate * 100}%, Tax: ${input.frictionAssumptions.sellTaxRate * 100}%, Slip: ${input.frictionAssumptions.slippageRate * 100}%`
        : 'Invalid or non-finite friction parameter encountered.',
    });

    const isDatasetValid =
      typeof input.datasetIdentity.symbol === 'string' &&
      input.datasetIdentity.symbol.trim().length > 0 &&
      Number.isInteger(input.datasetIdentity.totalBars) &&
      input.datasetIdentity.totalBars > 0 &&
      input.datasetIdentity.startDate <= input.datasetIdentity.endDate;

    mandatoryChecks.push({
      checkId: 'INPUT_DATASET_SANITY',
      name: 'Dataset Identity Sanity',
      dimension: 'DATA_INTEGRITY',
      passed: isDatasetValid,
      isHardBlocker: true,
      details: isDatasetValid
        ? `Symbol ${input.datasetIdentity.symbol}, Bars: ${input.datasetIdentity.totalBars}, Range: ${input.datasetIdentity.startDate} to ${input.datasetIdentity.endDate}`
        : 'Invalid dataset identity or chronologically reversed dates.',
    });

    // -------------------------------------------------------------------------
    // STEP 3: Phase 17.6 Quantitative Governance Verification (QG-01 to QG-10)
    // -------------------------------------------------------------------------
    const gov = input.governanceAudit;
    const governanceItems: { id: string; name: string; key: keyof MandatoryGovernanceAudit; desc: string }[] = [
      { id: 'QG-01', name: 'Zero Look-Ahead Bias', key: 'lookAheadFree', desc: 'Candlestick slice restricted strictly to [0...T]' },
      { id: 'QG-02', name: 'Active-Bar Isolation', key: 'activeBarIsolated', desc: 'Lookback calculations strictly exclude active bar T' },
      { id: 'QG-03', name: 'Next-Open Execution Timing', key: 'nextOpenExecution', desc: 'Orders queued at T close and filled at T+1 open' },
      { id: 'QG-04', name: 'Deterministic Reproducibility', key: 'deterministicReproducibility', desc: 'Zero unseeded randomness; bit-exact reproduction' },
      { id: 'QG-05', name: 'Strategy Contract Invariants', key: 'strategyContractValid', desc: 'Bounded confidence [0,1], valid actions, fail-closed handling' },
      { id: 'QG-06', name: 'Backtest State Isolation', key: 'backtestIsolatedFromPaper', desc: 'Backtests cannot mutate PaperBroker or PaperTradeLedger' },
      { id: 'QG-07', name: 'Zero Mock Contamination', key: 'zeroMockContamination', desc: 'No synthetic or mock price data in production pathways' },
      { id: 'QG-08', name: 'Risk Pipeline Preservation', key: 'riskPipelinePreserved', desc: 'RiskGuard & TradingDataValidator cannot be bypassed' },
      { id: 'QG-09', name: 'Financial Conservation', key: 'financialStateConserved', desc: 'Cash balances remain non-negative, board lots preserved' },
      { id: 'QG-10', name: 'Market Data Geometric Sanity', key: 'marketDataSanityVerified', desc: 'High >= Low, volume >= 0, sorted timestamps' },
    ];

    let hasGovernanceBlocker = false;
    for (const item of governanceItems) {
      const passed = Boolean(gov[item.key]);
      mandatoryChecks.push({
        checkId: item.id,
        name: item.name,
        dimension: 'GOVERNANCE',
        passed,
        isHardBlocker: true,
        details: passed ? `${item.desc}: VERIFIED` : `${item.desc}: VIOLATION DETECTED`,
      });
      if (!passed) {
        hasGovernanceBlocker = true;
        failedChecks.push(`[${item.id}] ${item.name} failed: ${item.desc}`);
      }
    }

    // Check upstream report governance blocks
    if (input.statisticalReport?.classification === 'BLOCKED') {
      hasGovernanceBlocker = true;
      failedChecks.push('[STATISTICAL_BLOCKED] Statistical report contains blocked governance status.');
    }
    if (input.generalizationReport?.classification === 'BLOCKED') {
      hasGovernanceBlocker = true;
      failedChecks.push('[GENERALIZATION_BLOCKED] Generalization report contains blocked governance status.');
    }

    // FAIL-CLOSED GOVERNANCE TERMINAL CHECK:
    if (hasGovernanceBlocker || !isFrictionValid || !isDatasetValid) {
      return Object.freeze({
        strategyId: input.strategyId,
        strategyName: input.strategyName,
        strategyVersion: input.strategyVersion,
        baselineFingerprint: fingerprint,
        certificationStatus: 'BLOCKED',
        governanceStatus: 'BLOCKED',
        antiOverfittingStatus: input.antiOverfittingReport?.verdict ?? 'NOT_EVALUATED',
        statisticalStatus: input.statisticalReport?.classification ?? 'NOT_EVALUATED',
        generalizationStatus: input.generalizationReport?.classification ?? 'NOT_EVALUATED',
        researchDiagnosticScore: input.generalizationReport?.score.totalScore ?? null,
        mandatoryChecks: Object.freeze(mandatoryChecks),
        conditionalChecks: Object.freeze(conditionalChecks),
        failedChecks: Object.freeze(failedChecks),
        warnings: Object.freeze(warnings),
        datasetScope: Object.freeze({
          symbol: input.datasetIdentity.symbol,
          totalBars: input.datasetIdentity.totalBars,
          startDate: input.datasetIdentity.startDate,
          endDate: input.datasetIdentity.endDate,
        }),
        assetScope: Object.freeze(input.validationScope?.testedSymbols ?? [input.datasetIdentity.symbol]),
        periodScope: Object.freeze(input.validationScope?.testedPeriods ?? []),
        regimeScope: Object.freeze(input.validationScope?.testedRegimes ?? []),
        frictionAssumptions: Object.freeze({
          commissionRate: input.frictionAssumptions.commissionRate,
          sellTaxRate: input.frictionAssumptions.sellTaxRate,
          slippageRate: input.frictionAssumptions.slippageRate,
          boardLot: input.frictionAssumptions.boardLot ?? 100,
        }),
        sampleSize: input.datasetIdentity.totalBars,
        tradeCount: input.statisticalReport?.observedMetrics.totalTrades ?? 0,
        limitations: Object.freeze(['CRITICAL_GOVERNANCE_BLOCKED: Mandatory governance invariant violation detected.']),
        certifiedBaseline: null,
        evaluatedAt,
      });
    }

    // -------------------------------------------------------------------------
    // STEP 4: Upstream Evidence Inspection
    // -------------------------------------------------------------------------
    const antiReport = input.antiOverfittingReport;
    const statReport = input.statisticalReport;
    const genReport = input.generalizationReport;

    if (!antiReport && !statReport) {
      failedChecks.push('[MISSING_EVIDENCE] Neither Anti-Overfitting (17.7) nor Statistical (17.8) reports provided.');
      return this.buildTerminalResult(input, fingerprint, evaluatedAt, 'INSUFFICIENT_EVIDENCE', mandatoryChecks, conditionalChecks, failedChecks, warnings, limitations, null);
    }

    const tradeCount =
      statReport?.observedMetrics.totalTrades ??
      antiReport?.distributionAnalysis.totalTrades ??
      0;

    // -------------------------------------------------------------------------
    // STEP 5: Hard Rejection Criteria (REJECTED)
    // -------------------------------------------------------------------------
    let hasHardRejection = false;

    // Anti-overfitting hard rejections
    if (antiReport) {
      const isFailedOrFragile = antiReport.verdict === 'FAILED' || antiReport.verdict === 'FRAGILE';
      mandatoryChecks.push({
        checkId: 'ANTI_OVERFIT_VERDICT',
        name: 'Anti-Overfitting Robustness Verdict',
        dimension: 'ANTI_OVERFITTING',
        passed: !isFailedOrFragile,
        isHardBlocker: false,
        details: `Report verdict: ${antiReport.verdict}`,
      });
      if (isFailedOrFragile) {
        hasHardRejection = true;
        failedChecks.push(`[OVERFITTING_FAILURE] Strategy classified as ${antiReport.verdict} under chronological OOS and sensitivity stress.`);
      }

      if (antiReport.oosComparison.isOosDegraded) {
        hasHardRejection = true;
        failedChecks.push(`[OOS_DEGRADATION] Severe Out-of-Sample return collapse (IS: ${antiReport.oosComparison.inSampleMetrics.totalReturnPct.toFixed(2)}% vs OOS: ${antiReport.oosComparison.outOfSampleMetrics.totalReturnPct.toFixed(2)}%).`);
      }

      if (!antiReport.frictionStress.survivesBaseFriction || antiReport.frictionStress.isFrictionFragile) {
        hasHardRejection = true;
        failedChecks.push(`[FRICTION_FRAGILE] Strategy collapses under realistic transaction friction (Drag: ${antiReport.frictionStress.totalFrictionDragPct.toFixed(2)}%).`);
      }

      if (antiReport.parameterSensitivity.overfitRiskFlag) {
        hasHardRejection = true;
        failedChecks.push('[PARAMETER_OVERFIT_CLIFF] Performance collapses under minor parameter perturbation.');
      }

      if (antiReport.distributionAnalysis.concentrationRiskFlag) {
        hasHardRejection = true;
        failedChecks.push(`[CONCENTRATION_RISK] Top 3 trades account for ${antiReport.distributionAnalysis.top3ProfitSharePct.toFixed(1)}% of total profit (threshold 80%).`);
      }
    }

    // Statistical hard rejections
    if (statReport) {
      const isStatFailed = statReport.classification === 'FAILED' || statReport.classification === 'FRAGILE_EDGE';
      mandatoryChecks.push({
        checkId: 'STATISTICAL_VERDICT',
        name: 'Statistical Significance Verdict',
        dimension: 'STATISTICAL',
        passed: !isStatFailed,
        isHardBlocker: false,
        details: `Statistical classification: ${statReport.classification}`,
      });
      if (isStatFailed) {
        hasHardRejection = true;
        failedChecks.push(`[STATISTICAL_FAILURE] Strategy failed statistical testing (${statReport.classification}).`);
      }

      if (statReport.observedMetrics.netProfit <= 0 || statReport.observedMetrics.totalReturnPct <= 0) {
        hasHardRejection = true;
        failedChecks.push(`[NEGATIVE_NET_PROFIT] Strategy generated zero or negative net profit net of friction (${statReport.observedMetrics.netProfit.toLocaleString()} VND).`);
      }

      if (statReport.edgeConsistency.edgeCollapsesWithoutTopTrades) {
        hasHardRejection = true;
        failedChecks.push('[EDGE_COLLAPSE_WITHOUT_TOP_TRADES] Net profit turns negative when excluding the top 3 outlier trades.');
      }

      if (statReport.profitConcentration.concentrationRisk) {
        hasHardRejection = true;
        failedChecks.push(`[PROFIT_CONCENTRATION] Severe profit concentration: Top 1 trade = ${statReport.profitConcentration.top1ProfitSharePct.toFixed(1)}%, Top 3 = ${statReport.profitConcentration.top3ProfitSharePct.toFixed(1)}%.`);
      }

      if (
        statReport.samplePower.isSufficientForInference &&
        statReport.realityCheck.status === 'INCONCLUSIVE_NOISE'
      ) {
        hasHardRejection = true;
        failedChecks.push('[REALITY_CHECK_NULL_HYPOTHESIS] Observed performance is indistinguishable from random trade noise (p > 0.20).');
      }
    }

    // Generalization hard rejections
    if (genReport) {
      const isGenFailed = genReport.classification === 'FAILED';
      mandatoryChecks.push({
        checkId: 'GENERALIZATION_VERDICT',
        name: 'Generalization Robustness Verdict',
        dimension: 'GENERALIZATION',
        passed: !isGenFailed,
        isHardBlocker: false,
        details: `Generalization classification: ${genReport.classification}`,
      });
      if (isGenFailed) {
        hasHardRejection = true;
        failedChecks.push('[GENERALIZATION_FAILURE] Strategy failed multi-asset or multi-regime generalization.');
      }

      if (genReport.crossAsset.profitableAssetRatio === 0 && genReport.crossAsset.testedAssets > 1) {
        hasHardRejection = true;
        failedChecks.push('[ZERO_ASSET_GENERALIZATION] Strategy failed to achieve profitability on any tested asset.');
      }

      if (
        genReport.score.penalties.regimeFailurePenalty < 0 &&
        genReport.score.penalties.recentDegradationPenalty < 0
      ) {
        hasHardRejection = true;
        failedChecks.push('[CATASTROPHIC_DEGRADATION] Combined severe regime failure and recent period degradation.');
      }
    }

    // If hard rejection occurred, conclude as REJECTED
    if (hasHardRejection) {
      return this.buildTerminalResult(input, fingerprint, evaluatedAt, 'REJECTED', mandatoryChecks, conditionalChecks, failedChecks, warnings, limitations, null);
    }

    // -------------------------------------------------------------------------
    // STEP 6: Insufficient Evidence Checks (INSUFFICIENT_EVIDENCE)
    // -------------------------------------------------------------------------
    let isInsufficient = false;

    // Minimum trade count for reliable statistical inference: 30 trades
    const isTradeSampleAdequate = tradeCount >= 30;
    mandatoryChecks.push({
      checkId: 'SAMPLE_SIZE_ADEQUACY',
      name: 'Trade Sample Size Adequacy (>= 30 trades)',
      dimension: 'STATISTICAL',
      passed: isTradeSampleAdequate,
      isHardBlocker: false,
      details: `Completed trades: ${tradeCount} (Threshold: 30 trades for inference)`,
    });
    if (!isTradeSampleAdequate) {
      isInsufficient = true;
      warnings.push(`[INSUFFICIENT_TRADES] Completed trades (${tradeCount}) is below the minimum threshold of 30 trades.`);
    }

    if (statReport?.samplePower.tier === 'INSUFFICIENT_DATA' || statReport?.classification === 'INSUFFICIENT_DATA') {
      isInsufficient = true;
      warnings.push('[INSUFFICIENT_STATISTICAL_DATA] Statistical validator marked data as insufficient.');
    }

    if (antiReport?.verdict === 'INSUFFICIENT_DATA' || antiReport?.sampleSize.classification === 'INSUFFICIENT_SAMPLE') {
      isInsufficient = true;
      warnings.push('[INSUFFICIENT_ANTI_OVERFIT_DATA] Anti-overfitting engine marked sample as insufficient.');
    }

    if (genReport?.classification === 'INSUFFICIENT_DATA') {
      isInsufficient = true;
      warnings.push('[INSUFFICIENT_GENERALIZATION_DATA] Cross-generalization validator marked sample as insufficient.');
    }

    // Notice: Diagnostic score CANNOT override insufficient evidence (Anti-slop rule)
    if (isInsufficient) {
      limitations.push('INSUFFICIENT_SAMPLE_POWER: Insufficient trades or sample depth to certify as a reliable research baseline.');
      return this.buildTerminalResult(input, fingerprint, evaluatedAt, 'INSUFFICIENT_EVIDENCE', mandatoryChecks, conditionalChecks, failedChecks, warnings, limitations, null);
    }

    // -------------------------------------------------------------------------
    // STEP 7: Conditional Certification Criteria (CONDITIONALLY_CERTIFIED)
    // -------------------------------------------------------------------------
    let isConditional = false;

    // Anti-overfitting conditionals
    if (antiReport?.verdict === 'CONDITIONALLY_ROBUST') {
      isConditional = true;
      conditionalChecks.push('[CONDITIONALLY_ROBUST] Strategy passes anti-overfitting with noted caveats.');
      limitations.push('ANTI_OVERFIT_CONDITIONAL: Strategy shows moderate parameter sensitivity or walk-forward variance.');
    }

    if (antiReport && !antiReport.frictionStress.survivesHighSlippage) {
      isConditional = true;
      conditionalChecks.push('[HIGH_SLIPPAGE_VULNERABILITY] Strategy underperforms under extreme slippage (0.50%).');
      limitations.push('SLIPPAGE_SENSITIVITY: Performance is vulnerable to fast-market execution slippage.');
    }

    // Statistical conditionals
    if (statReport?.classification === 'CONDITIONALLY_SUPPORTED') {
      isConditional = true;
      conditionalChecks.push('[CONDITIONALLY_SUPPORTED] Statistical evidence is positive but exhibits caveats.');
      limitations.push('STATISTICAL_CONDITIONAL: Edge is positive but confidence intervals or reality check exhibit moderate variance.');
    }

    if (statReport?.samplePower.tier === 'LOW_STATISTICAL_POWER') {
      isConditional = true;
      conditionalChecks.push('[LOW_STATISTICAL_POWER] Sample size between 30 and 49 trades; wider confidence intervals present.');
      limitations.push('LOW_SAMPLE_POWER: 30-49 trades. Additional validation sample recommended.');
    }

    if (statReport?.realityCheck.status === 'BORDERLINE_EVIDENCE') {
      isConditional = true;
      conditionalChecks.push('[BORDERLINE_REALITY_CHECK] Reality check percentile between 80% and 95%.');
      limitations.push('BORDERLINE_EDGE: Strategy exceeds 80% of random noise simulations, but p-value > 0.05.');
    }

    if (statReport?.bootstrapCI && statReport.bootstrapCI.meanTradeReturnPct.spansZero) {
      isConditional = true;
      conditionalChecks.push('[BOOTSTRAP_CI_SPANS_ZERO] Bootstrap 95% CI of trade return spans zero.');
      limitations.push('BOOTSTRAP_VARIANCE: 95% bootstrap confidence interval lower bound spans zero.');
    }

    // Generalization conditionals
    if (genReport) {
      if (genReport.classification === 'CONDITIONALLY_GENERALIZES') {
        isConditional = true;
        conditionalChecks.push('[CONDITIONALLY_GENERALIZES] Multi-asset / multi-regime evidence is moderately positive.');
        limitations.push('GENERALIZATION_CONDITIONAL: Strategy generalizes with documented cross-dimensional variance.');
      } else if (genReport.classification === 'REGIME_DEPENDENT') {
        isConditional = true;
        conditionalChecks.push(`[REGIME_DEPENDENT] Strategy performance is strongly dependent on ${genReport.crossRegime.dominantRegime || 'specific'} market regime.`);
        limitations.push(`REGIME_DEPENDENCE: Performance is limited to ${genReport.crossRegime.dominantRegime || 'favorable'} regime; down-regimes show stagnation.`);
      } else if (genReport.classification === 'ASSET_DEPENDENT') {
        isConditional = true;
        conditionalChecks.push('[ASSET_DEPENDENT] Strategy demonstrates edge on specific tickers but fails to generalize broadly.');
        limitations.push('ASSET_DEPENDENCE: Strategy is tuned to specific asset volatility dynamics; verify per-asset.');
      } else if (genReport.classification === 'PERIOD_DEPENDENT') {
        isConditional = true;
        conditionalChecks.push('[PERIOD_DEPENDENT] Strategy performance varies significantly across chronological eras.');
        limitations.push('PERIOD_DEPENDENCE: Strategy exhibits historical era dependency.');
      } else if (genReport.classification === 'WEAK_GENERALIZATION') {
        isConditional = true;
        conditionalChecks.push('[WEAK_GENERALIZATION] Limited evidence of cross-dimensional generalization.');
        limitations.push('WEAK_GENERALIZATION: Strategy should be treated with tight risk parameters.');
      }

      if (genReport.score.penalties.recentDegradationPenalty < 0) {
        isConditional = true;
        conditionalChecks.push('[RECENT_PERIOD_DEGRADATION] Strategy returns decayed in the most recent historical slice.');
        limitations.push('RECENT_DEGRADATION: Recent historical performance is weaker than earlier cycles.');
      }
    }

    // -------------------------------------------------------------------------
    // STEP 8: Decision & Frozen Baseline Synthesis
    // -------------------------------------------------------------------------
    const certificationStatus: StrategyCertificationStatus = isConditional
      ? 'CONDITIONALLY_CERTIFIED'
      : 'CERTIFIED';

    const frozenBaseline: CertifiedStrategyBaseline = Object.freeze({
      baselineFingerprint: fingerprint,
      strategyId: input.strategyId,
      strategyName: input.strategyName,
      strategyVersion: input.strategyVersion,
      parameters: Object.freeze({ ...input.strategyParameters }),
      methodologyVersion: input.methodologyVersion,
      frictionModel: Object.freeze({
        commissionRate: input.frictionAssumptions.commissionRate,
        sellTaxRate: input.frictionAssumptions.sellTaxRate,
        slippageRate: input.frictionAssumptions.slippageRate,
        boardLot: input.frictionAssumptions.boardLot ?? 100,
      }),
      validationSummary: Object.freeze({
        governanceVerdict: 'PASS',
        antiOverfittingVerdict: antiReport?.verdict ?? 'ROBUST',
        statisticalVerdict: statReport?.classification ?? 'STATISTICALLY_SUPPORTED',
        generalizationVerdict: genReport?.classification ?? 'GENERALIZES_WELL',
        diagnosticScore: genReport?.score.totalScore ?? null,
        totalTrades: tradeCount,
      }),
      certificationStatus,
      limitations: Object.freeze([...limitations]),
      certifiedAtTimestamp: evaluatedAt,
    });

    return this.buildTerminalResult(
      input,
      fingerprint,
      evaluatedAt,
      certificationStatus,
      mandatoryChecks,
      conditionalChecks,
      failedChecks,
      warnings,
      limitations,
      frozenBaseline
    );
  }

  /**
   * Verifies whether a current strategy configuration matches its certified research baseline.
   * Detects parameter drift, methodology changes, friction differences, or scope alterations.
   */
  public static verifyBaselineIntegrity(
    baseline: CertifiedStrategyBaseline,
    currentConfig: StrategyFingerprintInput
  ): BaselineIntegrityResult {
    const currentFingerprint = this.computeFingerprint(currentConfig);
    const isValid = baseline.baselineFingerprint === currentFingerprint;
    const driftReasons: string[] = [];

    if (!isValid) {
      if (baseline.strategyId !== currentConfig.strategyId) {
        driftReasons.push(`Strategy ID mismatch: baseline '${baseline.strategyId}' vs current '${currentConfig.strategyId}'`);
      }
      if (baseline.strategyVersion !== currentConfig.strategyVersion) {
        driftReasons.push(`Strategy version mismatch: baseline '${baseline.strategyVersion}' vs current '${currentConfig.strategyVersion}'`);
      }
      if (baseline.methodologyVersion !== currentConfig.methodologyVersion) {
        driftReasons.push(`Methodology version mismatch: baseline '${baseline.methodologyVersion}' vs current '${currentConfig.methodologyVersion}'`);
      }

      // Check parameter drift
      const baseParams = baseline.parameters;
      const curParams = currentConfig.strategyParameters;
      const allParamKeys = Array.from(new Set([...Object.keys(baseParams), ...Object.keys(curParams)]));
      for (const k of allParamKeys) {
        if (!(k in baseParams)) {
          driftReasons.push(`New parameter added: '${k}' = ${JSON.stringify(curParams[k])}`);
        } else if (!(k in curParams)) {
          driftReasons.push(`Parameter removed: '${k}'`);
        } else if (JSON.stringify(baseParams[k]) !== JSON.stringify(curParams[k])) {
          driftReasons.push(`Parameter modified: '${k}' changed from ${JSON.stringify(baseParams[k])} to ${JSON.stringify(curParams[k])}`);
        }
      }

      // Check friction model drift
      if (baseline.frictionModel.commissionRate !== currentConfig.frictionAssumptions.commissionRate) {
        driftReasons.push(`Commission rate modified: baseline ${baseline.frictionModel.commissionRate} vs current ${currentConfig.frictionAssumptions.commissionRate}`);
      }
      if (baseline.frictionModel.sellTaxRate !== currentConfig.frictionAssumptions.sellTaxRate) {
        driftReasons.push(`Sell tax rate modified: baseline ${baseline.frictionModel.sellTaxRate} vs current ${currentConfig.frictionAssumptions.sellTaxRate}`);
      }
      if (baseline.frictionModel.slippageRate !== currentConfig.frictionAssumptions.slippageRate) {
        driftReasons.push(`Slippage rate modified: baseline ${baseline.frictionModel.slippageRate} vs current ${currentConfig.frictionAssumptions.slippageRate}`);
      }
      const curBoardLot = currentConfig.frictionAssumptions.boardLot ?? 100;
      if (baseline.frictionModel.boardLot !== curBoardLot) {
        driftReasons.push(`Board lot modified: baseline ${baseline.frictionModel.boardLot} vs current ${curBoardLot}`);
      }

      // If no specific component was identified, record general fingerprint divergence
      if (driftReasons.length === 0) {
        driftReasons.push('Dataset identity or validation scope divergence detected.');
      }
    }

    return Object.freeze({
      isValid,
      status: isValid ? 'VALID' : 'REQUIRES_REVALIDATION',
      expectedFingerprint: baseline.baselineFingerprint,
      currentFingerprint,
      driftReasons: Object.freeze(driftReasons),
    });
  }

  /**
   * Helper to build frozen certification output object
   */
  private static buildTerminalResult(
    input: StrategyAcceptanceGateInput,
    fingerprint: string,
    evaluatedAt: string,
    certificationStatus: StrategyCertificationStatus,
    mandatoryChecks: readonly MandatoryCheckResult[],
    conditionalChecks: readonly string[],
    failedChecks: readonly string[],
    warnings: readonly string[],
    limitations: readonly string[],
    certifiedBaseline: CertifiedStrategyBaseline | null
  ): StrategyCertification {
    return Object.freeze({
      strategyId: input.strategyId,
      strategyName: input.strategyName,
      strategyVersion: input.strategyVersion,
      baselineFingerprint: fingerprint,
      certificationStatus,
      governanceStatus: 'PASS',
      antiOverfittingStatus: input.antiOverfittingReport?.verdict ?? 'NOT_EVALUATED',
      statisticalStatus: input.statisticalReport?.classification ?? 'NOT_EVALUATED',
      generalizationStatus: input.generalizationReport?.classification ?? 'NOT_EVALUATED',
      researchDiagnosticScore: input.generalizationReport?.score.totalScore ?? null,
      mandatoryChecks: Object.freeze([...mandatoryChecks]),
      conditionalChecks: Object.freeze([...conditionalChecks]),
      failedChecks: Object.freeze([...failedChecks]),
      warnings: Object.freeze([...warnings]),
      datasetScope: Object.freeze({
        symbol: input.datasetIdentity.symbol,
        totalBars: input.datasetIdentity.totalBars,
        startDate: input.datasetIdentity.startDate,
        endDate: input.datasetIdentity.endDate,
      }),
      assetScope: Object.freeze(input.validationScope?.testedSymbols ?? [input.datasetIdentity.symbol]),
      periodScope: Object.freeze(input.validationScope?.testedPeriods ?? []),
      regimeScope: Object.freeze(input.validationScope?.testedRegimes ?? []),
      frictionAssumptions: Object.freeze({
        commissionRate: input.frictionAssumptions.commissionRate,
        sellTaxRate: input.frictionAssumptions.sellTaxRate,
        slippageRate: input.frictionAssumptions.slippageRate,
        boardLot: input.frictionAssumptions.boardLot ?? 100,
      }),
      sampleSize: input.datasetIdentity.totalBars,
      tradeCount:
        input.statisticalReport?.observedMetrics.totalTrades ??
        input.antiOverfittingReport?.distributionAnalysis.totalTrades ??
        0,
      limitations: Object.freeze([...limitations]),
      certifiedBaseline,
      evaluatedAt,
    });
  }
}
