/**
 * DECISION OS — CANONICAL TYPES (DECISION-01 → 05)
 * =================================================
 * Pure types only. ANALYSIS vs DECISION strictly separated:
 * a score (BUY_SCORE = 82) never automatically becomes a decision (BUY).
 * Strategy HOLD/FLAT is never silently converted.
 */

export type DecisionType =
  | 'BUY' | 'ADD' | 'HOLD' | 'REDUCE' | 'SELL' | 'AVOID' | 'WATCH' | 'EXIT';

export type DecisionStatus =
  | 'PENDING' | 'ELIGIBLE' | 'APPROVED' | 'REJECTED'
  | 'BLOCKED' | 'EXECUTED' | 'MONITORING' | 'CLOSED' | 'REVIEW_REQUIRED';

export type DecisionFailCode =
  | 'DATA_UNAVAILABLE'
  | 'ANALYSIS_INCOMPLETE'
  | 'RISK_UNAVAILABLE'
  | 'VALUATION_UNAVAILABLE'
  | 'PORTFOLIO_CONTEXT_UNAVAILABLE';

export interface EvidenceRef {
  readonly kind: string;
  readonly ref: string;
  readonly asOfDate: string;
  readonly source: string;
}

export interface DecisionProvenance {
  readonly dataVersion: string;
  readonly asOfDate: string;
  readonly analysisVersion: string;
  readonly strategyVersion: string;
  readonly riskPolicyVersion: string;
  readonly positionSizingVersion: string;
}

export interface DecisionObject {
  readonly decisionId: string;
  readonly instrumentId: string;
  readonly asOfDate: string;
  readonly decisionType: DecisionType;
  readonly decisionStatus: DecisionStatus;
  readonly evidence: readonly EvidenceRef[];
  readonly thesisId: string | null;
  readonly valuation: EvidenceRef | null;
  readonly strategy: EvidenceRef | null;
  readonly portfolioContext: EvidenceRef | null;
  readonly riskContext: EvidenceRef | null;
  readonly positionSizing: EvidenceRef | null;
  readonly constraints: readonly string[];
  readonly confidence: number | null;
  readonly dataQuality: string;
  readonly provenance: DecisionProvenance;
  readonly createdAt: string;
  readonly version: string;
  readonly failCode: DecisionFailCode | null;
  readonly notes: readonly string[];
}

export type ThesisStatus = 'DRAFT' | 'ACTIVE' | 'CHALLENGED' | 'INVALIDATED' | 'CONFIRMED' | 'CLOSED';

export interface ThesisScenario {
  readonly name: 'BULL' | 'BASE' | 'BEAR';
  readonly assumptions: readonly string[];
  readonly drivers: readonly string[];
  readonly risks: readonly string[];
  readonly valuationImplication: string | null;
  readonly probability: number | null;
}

export interface InvestmentThesis {
  readonly thesisId: string;
  readonly instrumentId: string;
  readonly asOfDate: string;
  readonly status: ThesisStatus;
  readonly coreThesis: string;
  readonly supportingEvidence: readonly EvidenceRef[];
  readonly catalysts: readonly string[];
  readonly risks: readonly string[];
  readonly valuationArgument: string | null;
  readonly industryContext: string | null;
  readonly macroContext: string | null;
  readonly expectedOutcome: string | null;
  readonly timeHorizon: string | null;
  readonly invalidationConditions: readonly string[];
  readonly scenarios: readonly ThesisScenario[];
  readonly history: readonly { readonly status: ThesisStatus; readonly at: string; readonly note: string }[];
  readonly version: string;
}

export type RiskState = 'ACCEPTABLE' | 'CAUTION' | 'HIGH_RISK' | 'BLOCKED' | 'UNKNOWN';

export interface RiskDecision {
  readonly state: RiskState;
  readonly hardBreaches: readonly string[];
  readonly softWarnings: readonly string[];
  readonly riskPolicyVersion: string;
  readonly evaluatedAt: string;
}

export type SizeState = 'FULL' | 'REDUCED' | 'MINIMUM' | 'ZERO' | 'BLOCKED';

export type ZeroReason =
  | 'ZERO_BY_NO_SIGNAL'
  | 'ZERO_BY_RISK'
  | 'ZERO_BY_CONSTRAINT'
  | 'ZERO_BY_DATA_UNAVAILABLE'
  | 'ZERO_BY_PORTFOLIO_LIMIT';

export interface SizingDecision {
  readonly state: SizeState;
  readonly quantity: number;
  readonly zeroReason: ZeroReason | null;
  readonly lotRounded: boolean;
  readonly warnings: readonly string[];
}

export type MonitorTrigger =
  | 'THESIS_INVALIDATED' | 'RISK_LIMIT_BREACHED' | 'TARGET_REACHED'
  | 'STOP_TRIGGERED' | 'VALUATION_CHANGED' | 'FUNDAMENTAL_CHANGED'
  | 'MACRO_CHANGED' | 'INDUSTRY_CHANGED' | 'DATA_INVALID' | 'POSITION_CHANGED';

export interface DecisionReview {
  readonly reviewId: string;
  readonly decisionId: string;
  readonly originalDecision: DecisionType;
  readonly originalEvidence: readonly EvidenceRef[];
  readonly actualOutcome: string | null;
  readonly whatChanged: readonly string[];
  readonly whatWasCorrect: readonly string[];
  readonly whatWasWrong: readonly string[];
  readonly lessons: readonly string[];
  readonly newDecision: DecisionType | null;
  readonly reviewedAt: string;
}

export const DECISION_OS_VERSION = 'v1.0.0-decision-os';
