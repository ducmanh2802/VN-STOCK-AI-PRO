/**
 * PHASE 17.10 — STRATEGY ACCEPTANCE GATE & RESEARCH CERTIFICATION TYPES
 * =======================================================================
 * Pure TypeScript contracts for the final quantitative research governance gate.
 * 
 * STRICT GOVERNANCE:
 *   - Research infrastructure only — no live execution, order mutation, or paper broker coupling.
 *   - 100% deterministic and reproducible.
 *   - Fail-closed evaluation hierarchy.
 *   - Diagnostic score cannot override failed hard controls.
 */

import type {
  RobustnessClassification,
  StrategyRobustnessReport,
} from './types.ts';
import type {
  FinalStatisticalClassification,
  StrategyStatisticalReport,
} from './statisticalTypes.ts';
import type {
  CrossGeneralizationReport,
  GeneralizationClassification,
} from './generalizationTypes.ts';

/**
 * Final research certification statuses
 */
export type StrategyCertificationStatus =
  | 'CERTIFIED'
  | 'CONDITIONALLY_CERTIFIED'
  | 'REJECTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'BLOCKED';

/**
 * Mandatory Quantitative Governance Audit Input (Phase 17.6)
 */
export interface MandatoryGovernanceAudit {
  readonly lookAheadFree: boolean;
  readonly activeBarIsolated: boolean;
  readonly nextOpenExecution: boolean;
  readonly deterministicReproducibility: boolean;
  readonly strategyContractValid: boolean;
  readonly backtestIsolatedFromPaper: boolean;
  readonly zeroMockContamination: boolean;
  readonly riskPipelinePreserved: boolean;
  readonly financialStateConserved: boolean;
  readonly marketDataSanityVerified: boolean;
}

/**
 * Inputs required for deterministic Strategy Baseline Fingerprinting
 */
export interface StrategyFingerprintInput {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly strategyParameters: Readonly<Record<string, unknown>>;
  readonly methodologyVersion: string;
  readonly frictionAssumptions: {
    readonly commissionRate: number; // e.g. 0.0015
    readonly sellTaxRate: number;     // e.g. 0.0010
    readonly slippageRate: number;    // e.g. 0.0010
    readonly boardLot?: number;       // default: 100
  };
  readonly datasetIdentity: {
    readonly symbol: string;
    readonly totalBars: number;
    readonly startDate: string;
    readonly endDate: string;
    readonly dataHash?: string;
  };
  readonly validationScope?: {
    readonly testedSymbols?: readonly string[];
    readonly testedPeriods?: readonly string[];
    readonly testedRegimes?: readonly string[];
  };
}

/**
 * Comprehensive input for the Strategy Acceptance Gate
 */
export interface StrategyAcceptanceGateInput extends StrategyFingerprintInput {
  governanceAudit: MandatoryGovernanceAudit;
  antiOverfittingReport?: StrategyRobustnessReport | null;
  statisticalReport?: StrategyStatisticalReport | null;
  generalizationReport?: CrossGeneralizationReport | null;
  evaluationTimestamp?: string; // Optional fixed ISO timestamp for deterministic auditing
}

/**
 * Individual mandatory check result
 */
export interface MandatoryCheckResult {
  readonly checkId: string;
  readonly name: string;
  readonly dimension: 'GOVERNANCE' | 'ANTI_OVERFITTING' | 'STATISTICAL' | 'GENERALIZATION' | 'DATA_INTEGRITY';
  readonly passed: boolean;
  readonly isHardBlocker: boolean;
  readonly details: string;
}

/**
 * Immutable Frozen Research Baseline representation
 */
export interface CertifiedStrategyBaseline {
  readonly baselineFingerprint: string;
  readonly strategyId: string;
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly methodologyVersion: string;
  readonly frictionModel: {
    readonly commissionRate: number;
    readonly sellTaxRate: number;
    readonly slippageRate: number;
    readonly boardLot: number;
  };
  readonly validationSummary: {
    readonly governanceVerdict: 'PASS';
    readonly antiOverfittingVerdict: RobustnessClassification;
    readonly statisticalVerdict: FinalStatisticalClassification;
    readonly generalizationVerdict: GeneralizationClassification;
    readonly diagnosticScore: number | null;
    readonly totalTrades: number;
  };
  readonly certificationStatus: 'CERTIFIED' | 'CONDITIONALLY_CERTIFIED';
  readonly limitations: readonly string[];
  readonly certifiedAtTimestamp: string;
}

/**
 * Comprehensive certification artifact produced by the acceptance gate
 */
export interface StrategyCertification {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly strategyVersion: string;
  readonly baselineFingerprint: string;

  readonly certificationStatus: StrategyCertificationStatus;

  readonly governanceStatus: 'PASS' | 'BLOCKED';
  readonly antiOverfittingStatus: RobustnessClassification | 'NOT_EVALUATED';
  readonly statisticalStatus: FinalStatisticalClassification | 'NOT_EVALUATED';
  readonly generalizationStatus: GeneralizationClassification | 'NOT_EVALUATED';

  readonly researchDiagnosticScore: number | null;

  readonly mandatoryChecks: readonly MandatoryCheckResult[];
  readonly conditionalChecks: readonly string[];
  readonly failedChecks: readonly string[];
  readonly warnings: readonly string[];

  readonly datasetScope: {
    readonly symbol: string;
    readonly totalBars: number;
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly assetScope: readonly string[];
  readonly periodScope: readonly string[];
  readonly regimeScope: readonly string[];

  readonly frictionAssumptions: {
    readonly commissionRate: number;
    readonly sellTaxRate: number;
    readonly slippageRate: number;
    readonly boardLot: number;
  };

  readonly sampleSize: number;
  readonly tradeCount: number;

  readonly limitations: readonly string[];

  readonly certifiedBaseline: CertifiedStrategyBaseline | null;
  readonly evaluatedAt: string;
}

/**
 * Baseline integrity and drift detection output
 */
export interface BaselineIntegrityResult {
  readonly isValid: boolean;
  readonly status: 'VALID' | 'REQUIRES_REVALIDATION';
  readonly expectedFingerprint: string;
  readonly currentFingerprint: string;
  readonly driftReasons: readonly string[];
}
