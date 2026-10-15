/**
 * RESEARCH — CANONICAL TYPES (RESEARCH-01 → 05)
 * ==============================================
 * Pure types. Point-in-time correctness + reproducibility + bias control +
 * realistic execution + costs + risk + robustness + auditability.
 * Nothing here invents data: missing PIT data fails closed.
 */

export type AdjustmentMode = 'RAW' | 'ADJUSTED';

export interface ResearchDataset {
  readonly instruments: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly dataSources: readonly string[];
  readonly pointInTimeRules: readonly string[];
  readonly corporateActionMode: 'EXPLICIT_EVENTS' | 'ADJUSTED_SERIES';
  readonly adjustmentMode: AdjustmentMode;
  readonly universeDefinition: string;
  readonly universeAsOf: string | null;
}

export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CERTIFIED' | 'NON_CERTIFIED';

export interface ResearchExperiment {
  readonly experimentId: string;
  readonly name: string;
  readonly description: string;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly universe: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly asOfSemantics: string;
  readonly dataVersion: string;
  readonly executionModelVersion: string;
  readonly riskModelVersion: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly createdAt: string;
  readonly status: ExperimentStatus;
  readonly dataset: ResearchDataset;
  readonly seed: number | null;
}

export type ResearchEventKind =
  | 'MARKET_OPEN' | 'MARKET_DATA' | 'SIGNAL' | 'ORDER'
  | 'FILL' | 'CORPORATE_ACTION' | 'MARKET_CLOSE' | 'REBALANCE' | 'RISK_EVENT';

export interface ResearchEvent {
  readonly seq: number;
  readonly kind: ResearchEventKind;
  readonly date: string;
  readonly detail: string;
}

export type OrderKind = 'MARKET' | 'LIMIT' | 'STOP';

export interface ResearchOrder {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly kind: OrderKind;
  readonly quantity: number;
  readonly limitPrice?: number | null;
  readonly stopPrice?: number | null;
}

export interface ResearchFill {
  readonly orderId: string;
  readonly price: number;
  readonly quantity: number;
  readonly fee: number;
  readonly tax: number;
  readonly slippage: number;
  readonly date: string;
}

export interface ResearchPortfolio {
  readonly cash: number;
  readonly positions: Readonly<Record<string, number>>;
  readonly marketValue: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly fees: number;
  readonly slippage: number;
  readonly turnover: number;
  readonly exposure: number;
  readonly leverage: number;
  readonly drawdownPct: number;
}

export type CostModelKind = 'FIXED' | 'BPS' | 'SPREAD';

export interface CostModel {
  readonly costModelVersion: string;
  readonly feeSchedule: string;
  readonly slippageModel: CostModelKind;
  readonly spreadModel: string | null;
  readonly impactModel: string | null;
  readonly buyFeeRate: number;
  readonly sellFeeRate: number;
  readonly sellTaxRate: number;
  readonly slippageRate: number;
  readonly maxParticipationRate: number;
  readonly boardLot: number;
}

export type SampleKind = 'IN_SAMPLE' | 'OUT_OF_SAMPLE' | 'WALK_FORWARD';

export interface WalkForwardWindow {
  readonly trainStart: string;
  readonly trainEnd: string;
  readonly validationStart: string;
  readonly validationEnd: string;
  readonly testStart: string;
  readonly testEnd: string;
}

export interface PerformanceMetrics {
  readonly cagrPct: number | null;
  readonly annualizedReturnPct: number | null;
  readonly volatilityPct: number | null;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly maxDrawdownPct: number;
  readonly calmar: number | null;
  readonly winRatePct: number | null;
  readonly profitFactor: number | null;
  readonly turnover: number;
  readonly averageTradePct: number | null;
  readonly exposure: number;
  readonly sampleSizeWarning: boolean;
}

export type BiasKind =
  | 'LOOK_AHEAD_BIAS' | 'SURVIVORSHIP_BIAS' | 'CURRENT_UNIVERSE_LEAK'
  | 'DATA_SNOOPING_RISK' | 'OVERFITTING_RISK';

export interface ResearchReport {
  readonly experiment: ResearchExperiment;
  readonly dataset: ResearchDataset;
  readonly strategy: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly period: { readonly start: string; readonly end: string };
  readonly universe: readonly string[];
  readonly executionModel: string;
  readonly costModel: CostModel;
  readonly riskModel: string;
  readonly metrics: PerformanceMetrics;
  readonly drawdown: number;
  readonly turnover: number;
  readonly exposure: number;
  readonly benchmark: string | null;
  readonly limitations: readonly string[];
  readonly warnings: readonly string[];
  readonly biases: readonly BiasKind[];
  readonly manifest: ReproducibilityManifest;
  readonly certification: 'CERTIFIED' | 'NON_CERTIFIED';
}

export interface ReproducibilityManifest {
  readonly datasetVersion: string;
  readonly dataSources: readonly string[];
  readonly strategyVersion: string;
  readonly codeVersion: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly executionModel: string;
  readonly costModel: CostModel;
  readonly riskModel: string;
  readonly universe: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly seed: number | null;
}

export const RESEARCH_VERSION = 'v1.0.0-research';
export const EXECUTION_MODEL_VERSION = 'v1.0.0-research-exec';
export const COST_MODEL_VERSION = 'v1.0.0-research-cost';
