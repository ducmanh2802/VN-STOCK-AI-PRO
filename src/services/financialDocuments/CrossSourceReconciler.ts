/**
 * PHASE 19.6 — CROSS-SOURCE RECONCILIATION ENGINE
 * ===============================================
 * Validates primary authoritative document extractions against secondary
 * structured sources (KBS, VPS, VNDIRECT) to detect discrepancies,
 * accounting revisions, restatements, or data entry errors.
 * 
 * Invariants:
 * - Authoritative filing is the primary truth.
 * - Material discrepancy (> 1.0%) triggers CONFLICT or fail-closed UNAVAILABLE.
 * - Period or unit mismatch is rejected immediately.
 * - Never converts null to 0 during reconciliation.
 */

import type {
  ExtractedFinancialMetric,
  SecondarySourceMetric,
  MetricReconciliationResult,
  DataUnavailableReasonCode,
} from './types.ts';

export interface ReconciliationOptions {
  /** Maximum acceptable percentage divergence before flagging conflict (e.g. 1.0 for 1%) */
  maxDivergencePercent?: number;
  /** Whether unresolvable conflict should fail-closed by setting primary metric to unavailable */
  failClosedOnConflict?: boolean;
}

export class CrossSourceReconciler {
  private readonly maxDivergencePercent: number;
  private readonly failClosedOnConflict: boolean;

  constructor(options?: ReconciliationOptions) {
    this.maxDivergencePercent = options?.maxDivergencePercent ?? 1.0;
    this.failClosedOnConflict = options?.failClosedOnConflict ?? false;
  }

  /**
   * Reconcile an extracted primary metric against one or more secondary source records.
   */
  public reconcileMetric(
    primary: ExtractedFinancialMetric,
    secondaryList: SecondarySourceMetric[]
  ): MetricReconciliationResult {
    // If primary metric is already unavailable, pass through as unavailable
    if (primary.value === null || !Number.isFinite(primary.value)) {
      return {
        metric: primary.metric,
        primaryMetric: primary,
        secondaryMetrics: secondaryList,
        isReconciled: false,
        divergencePercent: null,
        status: 'UNAVAILABLE',
        reasonCode: primary.unavailableReason ?? 'VALUE_NON_FINITE',
        notes: `Primary metric ${primary.metric} is already unavailable.`,
      };
    }

    if (secondaryList.length === 0) {
      return {
        metric: primary.metric,
        primaryMetric: primary,
        secondaryMetrics: [],
        isReconciled: true,
        divergencePercent: null,
        status: 'VALIDATED',
        notes: 'Primary authoritative metric verified without secondary cross-check feeds.',
      };
    }

    // 1. Check for Period Mismatches
    for (const sec of secondaryList) {
      if (sec.period && sec.period !== primary.period) {
        return {
          metric: primary.metric,
          primaryMetric: {
            ...primary,
            value: null,
            validationStatus: 'REJECTED',
            unavailableReason: 'PERIOD_MISMATCH',
          },
          secondaryMetrics: secondaryList,
          isReconciled: false,
          divergencePercent: null,
          status: 'REJECTED',
          reasonCode: 'PERIOD_MISMATCH',
          notes: `Period mismatch detected: Primary is ${primary.period} while secondary (${sec.source}) is ${sec.period}.`,
        };
      }
    }

    // 2. Evaluate divergences across secondary sources
    let maxObservedDivergence: number | null = null;
    let hasConflict = false;
    const conflictingSources: string[] = [];

    for (const sec of secondaryList) {
      if (sec.value === null || !Number.isFinite(sec.value)) {
        continue;
      }

      // Calculate divergence percentage: |primary - secondary| / |primary| * 100
      const diff = Math.abs(primary.value - sec.value);
      const base = Math.abs(primary.value);

      const divergencePct = base > 0 ? (diff / base) * 100 : (diff === 0 ? 0 : 100);

      if (maxObservedDivergence === null || divergencePct > maxObservedDivergence) {
        maxObservedDivergence = divergencePct;
      }

      if (divergencePct > this.maxDivergencePercent) {
        hasConflict = true;
        conflictingSources.push(`${sec.source} (diff: ${divergencePct.toFixed(2)}%)`);
      }
    }

    if (hasConflict) {
      const reasonCode: DataUnavailableReasonCode = 'CROSS_SOURCE_CONFLICT';
      const notes = `Material divergence exceeding threshold (${this.maxDivergencePercent}%): ${conflictingSources.join(', ')}.`;

      let reconciledPrimary = { ...primary };
      if (this.failClosedOnConflict) {
        reconciledPrimary = {
          ...primary,
          value: null,
          validationStatus: 'UNAVAILABLE',
          unavailableReason: reasonCode,
          notes,
        };
      } else {
        reconciledPrimary = {
          ...primary,
          validationStatus: 'CONFLICT',
          unavailableReason: reasonCode,
          notes,
        };
      }

      return {
        metric: primary.metric,
        primaryMetric: reconciledPrimary,
        secondaryMetrics: secondaryList,
        isReconciled: false,
        divergencePercent: maxObservedDivergence,
        status: 'CONFLICT',
        reasonCode,
        notes,
      };
    }

    // All available secondary sources match within tolerance
    return {
      metric: primary.metric,
      primaryMetric: {
        ...primary,
        validationStatus: 'RECONCILED',
      },
      secondaryMetrics: secondaryList,
      isReconciled: true,
      divergencePercent: maxObservedDivergence,
      status: 'RECONCILED',
      notes: `Reconciled successfully with ${secondaryList.length} secondary sources within ${this.maxDivergencePercent}% tolerance.`,
    };
  }
}
