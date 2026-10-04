/**
 * PHASE 25+ — MACRO RADAR & INTELLIGENCE DOMAIN CONTRACTS
 * ========================================================
 * Authoritative types, interfaces, and schemas for Macroeconomic Radar,
 * Market Regimes, Macro-to-Sector Causal Impacts, and Event Timelines.
 *
 * Invariants:
 *   - PR-01 Freshness lifecycle: CURRENT | STALE | UNAVAILABLE | INVALID
 *   - Pure deterministic rule engines for causal flows and sensitivity matrices
 *   - Zero synthetic data fabrication: missing indicators fail closed to null / UNAVAILABLE
 *   - Tabular and numerical accuracy with immutable provenance
 */

import type { DataFreshnessStatus } from '../../../types/stock.ts';

export type { DataFreshnessStatus };

/**
 * Macroeconomic indicator categories
 */
export type MacroCategory =
  | 'CENTRAL_BANK'
  | 'INTEREST_RATE'
  | 'CURRENCY'
  | 'COMMODITY'
  | 'LIQUIDITY'
  | 'ECONOMY'
  | 'GLOBAL_RISK'
  | 'VIETNAM_MARKET';

/**
 * Canonical Macro Trend Direction
 */
export type MacroTrendDirection =
  | 'RISING'
  | 'FALLING'
  | 'STABLE'
  | 'VOLATILE'
  | 'UNKNOWN';

/**
 * Central Bank Policy Stance
 */
export type CentralBankStance =
  | 'HAWKISH'
  | 'NEUTRAL'
  | 'DOVISH'
  | 'UNCHANGED'
  | 'UNKNOWN';

/**
 * Macro Market Regime Classification
 */
export type MacroRegimeType =
  | 'EXPANDING'        // High liquidity, accommodative rates, strong growth
  | 'NEUTRAL'          // Balanced economic conditions
  | 'TIGHTENING'       // Rate hikes, balance sheet runoff, liquidity drain
  | 'CAUTIOUS'         // Elevated global risks, FX pressure, mixed signals
  | 'INFLATIONARY'     // Rising commodity prices, cost-push inflation
  | 'ELEVATED_RISK'    // High VIX, yield curve inversion, geopolitical stress
  | 'ACCOMMODATIVE'    // Rate cuts, stimulus, credit expansion
  | 'UNKNOWN';

/**
 * Impact Direction on Sectors / Stocks
 */
export type ImpactDirection = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';

/**
 * Sensitivity Magnitude
 */
export type SensitivityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Macro Indicator Record
 */
export interface MacroMetricRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly nameVi: string;
  readonly category: MacroCategory;
  readonly country: 'US' | 'VN' | 'GLOBAL' | 'EU' | 'CN' | 'JP';
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly unit: string;
  readonly direction: MacroTrendDirection;
  readonly source: string;
  readonly timestamp: string;
  readonly period: string;
  readonly freshness: DataFreshnessStatus;
  readonly isBenchmark: boolean;
  readonly description: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Central Bank Profile & Latest Decision
 */
export interface CentralBankPolicy {
  readonly code: 'FED' | 'SBV' | 'ECB' | 'PBOC' | 'BOJ';
  readonly name: string;
  readonly country: string;
  readonly policyRate: number | null;
  readonly previousRate: number | null;
  readonly lastDecisionDate: string;
  readonly lastAction: 'HIKE' | 'CUT' | 'HOLD' | 'UNKNOWN';
  readonly stance: CentralBankStance;
  readonly nextMeetingDate: string | null;
  readonly summaryVi: string;
  readonly source: string;
  readonly freshness: DataFreshnessStatus;
}

/**
 * Sector Macro Sensitivity Mapping
 */
export interface SectorMacroSensitivity {
  readonly sectorId: string;
  readonly sectorNameVi: string;
  readonly primaryDriver: string;
  readonly secondaryDriver?: string;
  readonly direction: ImpactDirection;
  readonly sensitivity: SensitivityLevel;
  readonly rationaleVi: string;
  readonly keyStocks: readonly string[];
}

/**
 * Macro Causal Impact Node in the Transmission Chain
 */
export interface MacroCausalChain {
  readonly id: string;
  readonly title: string;
  readonly triggerMetric: string;
  readonly triggerDirection: 'UP' | 'DOWN';
  readonly steps: readonly {
    readonly order: number;
    readonly node: string;
    readonly impact: string;
    readonly direction: ImpactDirection;
  }[];
  readonly affectedSectors: readonly {
    readonly sector: string;
    readonly impact: ImpactDirection;
  }[];
  readonly explanationVi: string;
  readonly confidence: number; // 0 - 100
}

/**
 * Scheduled Macroeconomic Event
 */
export interface MacroCalendarEvent {
  readonly id: string;
  readonly date: string; // YYYY-MM-DD
  readonly time?: string; // HH:mm (UTC/ICT)
  readonly eventName: string;
  readonly eventNameVi: string;
  readonly country: 'US' | 'VN' | 'EU' | 'CN' | 'GLOBAL';
  readonly importance: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly actual: number | string | null;
  readonly forecast: number | string | null;
  readonly previous: number | string | null;
  readonly unit: string;
  readonly status: 'UPCOMING' | 'ANNOUNCED' | 'DELAYED';
  readonly category: MacroCategory;
}

/**
 * Macro Threshold Alert
 */
export interface MacroAlert {
  readonly id: string;
  readonly metricCode: string;
  readonly metricName: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'INFO';
  readonly triggeredAt: string;
  readonly messageVi: string;
  readonly triggerCondition: string;
  readonly impactSummaryVi: string;
}

/**
 * Weighted Macro Regime Evaluation Output
 */
export interface MacroRegimeResult {
  readonly regime: MacroRegimeType;
  readonly score: number; // 0 - 100
  readonly confidence: number; // 0 - 100
  readonly subScores: {
    readonly liquidity: number;      // 0 - 100
    readonly interestRates: number;  // 0 - 100
    readonly fxPressure: number;     // 0 - 100
    readonly commodities: number;    // 0 - 100
    readonly globalRisk: number;     // 0 - 100
    readonly foreignFlow: number;    // 0 - 100
  };
  readonly keyFactorsVi: readonly string[];
  readonly rationaleVi: string;
  readonly asOfDate: string;
  readonly freshness: DataFreshnessStatus;
}

/**
 * Complete Aggregated Macro Radar Snapshot
 */
export interface MacroRadarSnapshot {
  readonly asOfDate: string;
  readonly evaluatedAt: string;
  readonly dataFreshness: DataFreshnessStatus;
  readonly benchmarkRadar: readonly MacroMetricRecord[]; // Key top metrics (Fed, US10Y, DXY, Brent, Gold, USD/VND, VN Rates, VIX)
  readonly allMetrics: readonly MacroMetricRecord[];
  readonly centralBanks: readonly CentralBankPolicy[];
  readonly regime: MacroRegimeResult;
  readonly impactChains: readonly MacroCausalChain[];
  readonly sectorSensitivities: readonly SectorMacroSensitivity[];
  readonly upcomingEvents: readonly MacroCalendarEvent[];
  readonly activeAlerts: readonly MacroAlert[];
  readonly dataLineage: {
    readonly sources: readonly string[];
    readonly engineVersion: string;
    readonly metricCount: number;
  };
}
