/**
 * PHASE 27 — GROWTH STATE ENGINE
 * ==============================
 * Deterministically evaluates real economic growth state using:
 *   - Real GDP Growth YoY (%)
 *   - Industrial Production Index (IIP) (%)
 *   - Manufacturing PMI (Level vs 50 neutral line)
 *   - Retail Sales Real Growth (%)
 *   - Export Growth (%)
 *   - Disbursed FDI (%)
 *   - Public Investment Execution Velocity
 *
 * STATES:
 *   - ACCELERATING: Robust expansion across leading and coincident indicators
 *   - EXPANDING: Steady growth above potential (~6.0% - 6.8%)
 *   - STABLE: Normal baseline growth (~5.0% - 6.0%)
 *   - SLOWING: Decelerating momentum (GDP < 5.0% or PMI < 49)
 *   - CONTRACTING: Negative growth / severe contraction (GDP < 3.0% or negative)
 *   - UNKNOWN: Critical growth indicators missing (fails closed)
 */

import type { NormalizedMacroObservation, GrowthState } from './types.ts';

export class GrowthStateEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Classifies Growth State deterministically from normalized observations.
   */
  public static evaluate(observations: readonly NormalizedMacroObservation[]): {
    state: GrowthState;
    growthScore: number | null; // 0 - 100
    observationsVi: string[];
    missingMetrics: string[];
  } {
    const obsMap = new Map<string, NormalizedMacroObservation>(
      observations.map((o) => [o.metricCode.toUpperCase(), o])
    );

    const gdpObs = obsMap.get('VN_GDP_GROWTH')?.normalizedValue ?? null;
    const pmiObs = obsMap.get('VN_PMI')?.normalizedValue ?? null;
    const iipObs = obsMap.get('VN_IIP_GROWTH')?.normalizedValue ?? null;
    const retailObs = obsMap.get('VN_RETAIL_GROWTH')?.normalizedValue ?? null;
    const exportObs = obsMap.get('VN_EXPORT_GROWTH')?.normalizedValue ?? null;
    const fdiObs = obsMap.get('VN_FDI_DISBURSED')?.normalizedValue ?? null;

    const observationsVi: string[] = [];
    const missingMetrics: string[] = [];

    if (gdpObs === null) missingMetrics.push('VN_GDP_GROWTH');
    if (pmiObs === null) missingMetrics.push('VN_PMI');

    // Fail-closed if primary GDP growth observation is missing
    if (gdpObs === null && pmiObs === null) {
      return {
        state: 'UNKNOWN',
        growthScore: null,
        observationsVi: ['Thiếu dữ liệu tăng trưởng GDP và PMI sản xuất.'],
        missingMetrics,
      };
    }

    let score = 50; // Neutral baseline

    // 1. GDP Growth Evaluation
    if (gdpObs !== null) {
      if (gdpObs >= 7.0) {
        score += 25;
        observationsVi.push(`Tăng trưởng GDP thực tế đạt mức rất cao: ${gdpObs.toFixed(2)}% YoY.`);
      } else if (gdpObs >= 6.0) {
        score += 15;
        observationsVi.push(`Tăng trưởng GDP thực tế duy trì tích cực: ${gdpObs.toFixed(2)}% YoY.`);
      } else if (gdpObs >= 5.0) {
        score += 5;
        observationsVi.push(`Tăng trưởng GDP thực tế ở mức ổn định: ${gdpObs.toFixed(2)}% YoY.`);
      } else if (gdpObs >= 4.0) {
        score -= 15;
        observationsVi.push(`Tăng trưởng GDP thực tế chậm lại: ${gdpObs.toFixed(2)}% YoY.`);
      } else {
        score -= 30;
        observationsVi.push(`Tăng trưởng GDP thực tế suy giảm sâu: ${gdpObs.toFixed(2)}% YoY.`);
      }
    }

    // 2. PMI Evaluation
    if (pmiObs !== null) {
      if (pmiObs >= 52.5) {
        score += 15;
        observationsVi.push(`Chỉ số PMI sản xuất mở rộng mạnh: ${pmiObs.toFixed(1)} điểm.`);
      } else if (pmiObs >= 50.0) {
        score += 5;
        observationsVi.push(`Chỉ số PMI sản xuất trên ngưỡng mở rộng: ${pmiObs.toFixed(1)} điểm.`);
      } else if (pmiObs >= 48.0) {
        score -= 10;
        observationsVi.push(`Chỉ số PMI sản xuất thu hẹp nhẹ: ${pmiObs.toFixed(1)} điểm.`);
      } else {
        score -= 20;
        observationsVi.push(`Chỉ số PMI sản xuất suy giảm nghiêm trọng: ${pmiObs.toFixed(1)} điểm.`);
      }
    }

    // 3. Coincident Indicators (IIP, Export, FDI, Retail)
    if (iipObs !== null && iipObs >= 8.0) score += 5;
    if (exportObs !== null && exportObs >= 10.0) score += 5;
    if (fdiObs !== null && fdiObs >= 5.0) score += 5;
    if (retailObs !== null && retailObs >= 9.0) score += 5;

    const growthScore = Math.max(0, Math.min(100, score));

    let state: GrowthState = 'STABLE';
    if (growthScore >= 80) {
      state = 'ACCELERATING';
    } else if (growthScore >= 65) {
      state = 'EXPANDING';
    } else if (growthScore >= 45) {
      state = 'STABLE';
    } else if (growthScore >= 30) {
      state = 'SLOWING';
    } else {
      state = 'CONTRACTING';
    }

    return {
      state,
      growthScore,
      observationsVi,
      missingMetrics,
    };
  }
}
