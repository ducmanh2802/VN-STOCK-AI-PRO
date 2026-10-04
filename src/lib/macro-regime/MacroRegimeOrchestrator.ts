/**
 * PHASE 27 — MACRO REGIME ORCHESTRATOR
 * =====================================
 * Complete orchestrator building the canonical MacroRegimeSnapshot:
 *   1. Filters observations by publication cutoff (publicationDate <= asOfDate)
 *   2. Normalizes observations
 *   3. Evaluates 5 independent sub-states (Growth, Inflation, Monetary, External, Financial Conditions)
 *   4. Evaluates Data Coverage
 *   5. Classifies Growth x Inflation Macro Regime
 *   6. Detects Regime Transitions
 *   7. Attaches audit lineage & lookahead rejection report
 */

import type {
  MacroObservation,
  MacroRegimeSnapshot,
  MacroRegime,
} from './types.ts';
import { MacroNormalizer } from './MacroNormalizer.ts';
import { GrowthStateEngine } from './GrowthStateEngine.ts';
import { InflationStateEngine } from './InflationStateEngine.ts';
import { MonetaryStateEngine } from './MonetaryStateEngine.ts';
import { ExternalSectorEngine } from './ExternalSectorEngine.ts';
import { FinancialConditionsEngine } from './FinancialConditionsEngine.ts';
import { MacroRegimeClassifier } from './MacroRegimeClassifier.ts';
import { RegimeTransitionEngine } from './RegimeTransitionEngine.ts';

export interface BuildMacroSnapshotOptions {
  readonly observations: readonly MacroObservation[];
  readonly asOfDate?: string;
  readonly evaluatedAt?: string;
  readonly previousRegime?: MacroRegime;
  readonly priorPersistence?: number;
}

export class MacroRegimeOrchestrator {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Builds the complete deterministic MacroRegimeSnapshot.
   */
  public static buildSnapshot(options: BuildMacroSnapshotOptions): MacroRegimeSnapshot {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();

    // 1. Normalization and Publication Cutoff Filter
    const { normalizedList, lookaheadViolations } = MacroNormalizer.filterAndNormalize(
      options.observations,
      { asOfDate }
    );

    // 2. Sub-State Engines
    const growthResult = GrowthStateEngine.evaluate(normalizedList);
    const inflationResult = InflationStateEngine.evaluate(normalizedList);
    const monetaryResult = MonetaryStateEngine.evaluate(normalizedList);
    const externalResult = ExternalSectorEngine.evaluate(normalizedList);
    const financialConditionsResult = FinancialConditionsEngine.evaluate(normalizedList);

    const allMissing = Array.from(
      new Set([
        ...growthResult.missingMetrics,
        ...inflationResult.missingMetrics,
        ...monetaryResult.missingMetrics,
        ...externalResult.missingMetrics,
        ...financialConditionsResult.missingMetrics,
      ])
    );

    const allObservations = [
      ...growthResult.observationsVi,
      ...inflationResult.observationsVi,
      ...monetaryResult.observationsVi,
      ...externalResult.observationsVi,
      ...financialConditionsResult.observationsVi,
    ];

    // 3. Macro Regime Classification
    const classification = MacroRegimeClassifier.classify({
      growthState: growthResult.state,
      inflationState: inflationResult.state,
      monetaryState: monetaryResult.state,
      externalState: externalResult.state,
      financialConditionsState: financialConditionsResult.state,
      growthScore: growthResult.growthScore,
      inflationScore: inflationResult.inflationScore,
      monetaryScore: monetaryResult.monetaryScore,
      externalScore: externalResult.externalScore,
      financialConditionsScore: financialConditionsResult.financialConditionsScore,
      missingMetrics: allMissing,
      allObservationsVi: allObservations,
    });

    // 4. Regime Transition Detection
    const transition = RegimeTransitionEngine.detectTransition(
      classification.macroRegime,
      options.previousRegime ?? 'UNKNOWN',
      asOfDate,
      options.priorPersistence ?? 1
    );

    const dataFreshness = MacroNormalizer.deriveAggregateFreshness(normalizedList);
    const lookaheadRejected = lookaheadViolations.length > 0;

    return Object.freeze({
      snapshotId: `MACRO_REGIME_SNAPSHOT_${asOfDate}`,
      asOfDate,
      publicationCutoffDate: asOfDate,
      evaluatedAt,
      macroRegime: classification.macroRegime,
      growthState: growthResult.state,
      inflationState: inflationResult.state,
      monetaryState: monetaryResult.state,
      externalSectorState: externalResult.state,
      financialConditionsState: financialConditionsResult.state,
      dataCoverage: classification.dataCoverage,
      confidencePercent: classification.confidencePercent,
      diagnostics: classification.diagnostics,
      transition,
      activeObservations: Object.freeze(normalizedList),
      dataFreshness,
      classificationVersion: this.VERSION,
      lookaheadRejected,
      lookaheadViolations: Object.freeze(lookaheadViolations),
      rationaleVi: classification.rationaleVi,
    });
  }
}
