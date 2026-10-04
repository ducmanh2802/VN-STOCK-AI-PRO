/**
 * PHASE 26 — INDUSTRY CAPITAL CYCLE ENGINE
 * ========================================
 * Classifies an industry into one of 6 deterministic stages:
 *   1. EARLY_CYCLE
 *   2. ACCELERATING
 *   3. EXPANDING
 *   4. PEAKING
 *   5. DECELERATING
 *   6. CAPITAL_DESTRUCTION
 *
 * CONSTITUTIONAL RULE:
 *   - The Capital Cycle stage is purely an analytical description of industry health.
 *   - It is NEVER converted into a direct BUY or SELL recommendation.
 */

import type {
  CapitalCycleStage,
  IndustryCycleDrivers,
  IndustryCapitalCycleSnapshot,
  PolicyEvent,
  StrategicProject,
  DataFreshnessStatus,
} from './types.ts';

export interface EvaluateCapitalCycleInput {
  readonly sectorId: string;
  readonly sectorName: string;
  readonly asOfDate?: string;
  readonly drivers: IndustryCycleDrivers;
  readonly policies?: readonly PolicyEvent[];
  readonly projects?: readonly StrategicProject[];
}

export class CapitalCycleEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Evaluates drivers to determine the deterministic capital cycle stage.
   * Fail-closed: UNKNOWN carries a null score (never a plottable neutral 50).
   */
  public static classifyStage(drivers: IndustryCycleDrivers): {
    stage: CapitalCycleStage;
    cycleScore: number | null;
    observations: string[];
  } {
    const observations: string[] = [];

    const {
      policySupportScore,
      publicInvestmentVelocity,
      privateCapexTrend,
      industryCapacityUtilizationPercent,
      averageGrossMarginTrend,
      industryBookToBillRatio,
      roicVsWaccSpreadPercent,
    } = drivers;

    // 1. Check for severe capital destruction
    if (
      roicVsWaccSpreadPercent !== null &&
      roicVsWaccSpreadPercent < -3.0 &&
      averageGrossMarginTrend === 'COMPRESSING' &&
      privateCapexTrend === 'CONTRACTING'
    ) {
      observations.push('Severe economic value destruction: ROIC < WACC and contracting capex.');
      return {
        stage: 'CAPITAL_DESTRUCTION',
        cycleScore: 15,
        observations,
      };
    }

    // 2. Check for Decelerating cycle
    if (
      averageGrossMarginTrend === 'COMPRESSING' &&
      (industryCapacityUtilizationPercent !== null && industryCapacityUtilizationPercent > 85) &&
      (industryBookToBillRatio !== null && industryBookToBillRatio < 0.9)
    ) {
      observations.push('Overcapacity and slowing new order intake causing margin compression.');
      return {
        stage: 'DECELERATING',
        cycleScore: 35,
        observations,
      };
    }

    // 3. Check for Peaking cycle
    if (
      industryCapacityUtilizationPercent !== null &&
      industryCapacityUtilizationPercent >= 90 &&
      privateCapexTrend === 'EXPANDING' &&
      (averageGrossMarginTrend === 'STABLE' || averageGrossMarginTrend === 'COMPRESSING')
    ) {
      observations.push('Peak industry utilization with heavy capex expansion nearing saturation.');
      return {
        stage: 'PEAKING',
        cycleScore: 65,
        observations,
      };
    }

    // 4. Check for Expanding cycle
    if (
      privateCapexTrend === 'EXPANDING' &&
      averageGrossMarginTrend === 'EXPANDING' &&
      (roicVsWaccSpreadPercent === null || roicVsWaccSpreadPercent >= 2.0)
    ) {
      observations.push('Robust expansion: expanding capex accompanied by expanding gross margins and healthy ROIC.');
      return {
        stage: 'EXPANDING',
        cycleScore: 85,
        observations,
      };
    }

    // 5. Check for Accelerating cycle
    if (
      (industryBookToBillRatio !== null && industryBookToBillRatio >= 1.2) ||
      (publicInvestmentVelocity !== null && publicInvestmentVelocity >= 0.7)
    ) {
      observations.push('Accelerating order intake and rising project disbursement velocity.');
      return {
        stage: 'ACCELERATING',
        cycleScore: 75,
        observations,
      };
    }

    // 6. Check for Early Cycle (P26-P2-3): a lone policy signal never asserts
    // a cycle stage. EARLY_CYCLE requires strong policy support (>= 60) PLUS at
    // least one independent corroborating driver (slack capacity, public
    // investment flow, healthy order intake, or a known capex trend).
    const hasCorroboration =
      (industryCapacityUtilizationPercent !== null && industryCapacityUtilizationPercent < 75) ||
      publicInvestmentVelocity !== null ||
      (industryBookToBillRatio !== null && industryBookToBillRatio >= 1.0) ||
      (privateCapexTrend !== null && privateCapexTrend !== 'UNKNOWN');
    if (
      policySupportScore !== null &&
      policySupportScore >= 60 &&
      hasCorroboration
    ) {
      observations.push('Early cycle turnaround supported by government policy initiatives despite low capacity utilization.');
      return {
        stage: 'EARLY_CYCLE',
        cycleScore: 55,
        observations,
      };
    }

    // Fallback: Default to unknown if data is insufficient
    observations.push('Insufficient metric signals to establish conclusive capital cycle stage.');
    return {
      stage: 'UNKNOWN',
      // Fail-closed (P26-P2-1): no plottable neutral score on missing data.
      cycleScore: null,
      observations,
    };
  }

  /**
   * Generates a complete IndustryCapitalCycleSnapshot.
   */
  public static evaluateSnapshot(input: EvaluateCapitalCycleInput): IndustryCapitalCycleSnapshot {
    const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
    const { stage, cycleScore, observations } = this.classifyStage(input.drivers);

    const policies = input.policies ?? [];
    const projects = input.projects ?? [];

    const hasPolicies = policies.length > 0;
    const hasProjects = projects.length > 0;

    const confidence =
      stage === 'UNKNOWN'
        ? 'UNAVAILABLE'
        : hasPolicies && hasProjects
          ? 'HIGH'
          : 'MEDIUM';

    const freshness: DataFreshnessStatus =
      confidence === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'CURRENT';

    return {
      sectorId: input.sectorId,
      sectorName: input.sectorName,
      asOfDate,
      stage,
      cycleScore,
      confidence,
      drivers: input.drivers,
      keyPolicies: policies,
      majorProjects: projects,
      keyObservations: observations,
      freshness,
    };
  }
}
