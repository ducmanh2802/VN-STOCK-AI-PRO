/**
 * SECTION 6 — DATA COMPLETENESS
 * Completeness = available required metrics / total required metrics * 100.
 * Confidence is derived from completeness + market availability.
 * The UI must show uncertainty transparently — never claim HIGH confidence for
 * a result with sparse data.
 */
import type { DataQualitySummary, ConfidenceLevel } from '../../../types/enterpriseIntelligence.ts';

export interface CompletenessInput {
  financialPeriods: number;
  marketDataAvailable: boolean;
  /** metric key -> is present */
  metrics: Record<string, boolean>;
}

export class DataCompletenessEngine {
  static evaluate(input: CompletenessInput): DataQualitySummary {
    const keys = Object.keys(input.metrics);
    const present = keys.filter((k) => input.metrics[k]);
    const missing = keys.filter((k) => !input.metrics[k]);
    const completeness = keys.length === 0 ? 0 : Math.round((present.length / keys.length) * 100);
    const confidence = this.confidence(completeness, input.marketDataAvailable, input.financialPeriods);

    return {
      completeness,
      confidence,
      financialPeriods: input.financialPeriods,
      marketDataAvailable: input.marketDataAvailable,
      missingMetrics: missing,
    };
  }

  static confidence(completeness: number, marketDataAvailable: boolean, periods: number): ConfidenceLevel {
    if (completeness >= 75 && marketDataAvailable && periods >= 2) return 'HIGH';
    if (completeness >= 50) return 'MEDIUM';
    return 'LOW';
  }
}