/**
 * PHASE 27 — REGIME TRANSITION ENGINE
 * ===================================
 * Deterministically tracks macroeconomic cycle transitions and persistence.
 *
 * INVARIANT:
 *   - A regime transition is an observed empirical classification shift,
 *     NOT a causal assertion.
 */

import type { MacroRegime, RegimeTransition } from './types.ts';

export class RegimeTransitionEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Evaluates transition between previous and current regime.
   */
  public static detectTransition(
    currentRegime: MacroRegime,
    previousRegime: MacroRegime = 'UNKNOWN',
    currentDate: string = new Date().toISOString().slice(0, 10),
    priorPersistence: number = 1
  ): RegimeTransition {
    const isShift = previousRegime !== 'UNKNOWN' && currentRegime !== previousRegime;
    const persistencePeriods = isShift ? 1 : priorPersistence + 1;

    let shiftDescriptionVi = 'Duy trì trạng thái chu kỳ kinh tế vĩ mô hiện tại.';
    if (isShift) {
      shiftDescriptionVi = `Chuyển dịch chu kỳ kinh tế từ [${previousRegime}] sang [${currentRegime}] từ ngày ${currentDate}.`;
    }

    return {
      previousRegime,
      currentRegime,
      transitionDate: currentDate,
      persistencePeriods,
      isShift,
      shiftDescriptionVi,
    };
  }
}
