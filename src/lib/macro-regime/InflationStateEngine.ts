/**
 * PHASE 27 — INFLATION STATE ENGINE
 * =================================
 * Evaluates Headline CPI YoY, Core CPI YoY, and Inflation Momentum (3M vs 12M).
 *
 * STATES:
 *   - DISINFLATION: Falling inflation momentum, CPI within target
 *   - STABLE: Normal inflation within National Assembly target (< 4.0%)
 *   - RISING: Accelerating price momentum
 *   - HIGH_INFLATION: CPI exceeds statutory target (> 4.5%)
 *   - DEFLATION_RISK: Negative CPI or persistent demand destruction
 *   - UNKNOWN: Missing CPI observations (fails closed)
 */

import type { NormalizedMacroObservation, InflationState } from './types.ts';

export class InflationStateEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Classifies Inflation State deterministically.
   */
  public static evaluate(observations: readonly NormalizedMacroObservation[]): {
    state: InflationState;
    inflationScore: number | null; // 0 = severe inflation / deflation stress, 100 = optimal price stability
    observationsVi: string[];
    missingMetrics: string[];
  } {
    const obsMap = new Map<string, NormalizedMacroObservation>(
      observations.map((o) => [o.metricCode.toUpperCase(), o])
    );

    const cpiObs = obsMap.get('VN_CPI')?.normalizedValue ?? null;
    const coreCpiObs = obsMap.get('VN_CORE_CPI')?.normalizedValue ?? null;
    const cpiMomentum = obsMap.get('VN_CPI')?.momentum ?? null;

    const observationsVi: string[] = [];
    const missingMetrics: string[] = [];

    if (cpiObs === null) {
      missingMetrics.push('VN_CPI');
      return {
        state: 'UNKNOWN',
        inflationScore: null,
        observationsVi: ['Thiếu dữ liệu chỉ số giá tiêu dùng CPI.'],
        missingMetrics,
      };
    }

    let score = 70; // Baseline good stability

    // 1. Level Analysis
    if (cpiObs > 5.0) {
      score = 20;
      observationsVi.push(`Lạm phát CPI ở mức rất cao: ${cpiObs.toFixed(2)}% YoY (vượt trần mục tiêu).`);
    } else if (cpiObs >= 4.0) {
      score = 45;
      observationsVi.push(`Lạm phát CPI tiệm cận mục tiêu kiểm soát: ${cpiObs.toFixed(2)}% YoY.`);
    } else if (cpiObs >= 2.5 && cpiObs < 4.0) {
      score = 85;
      observationsVi.push(`Lạm phát CPI duy trì trong vùng ổn định mục tiêu: ${cpiObs.toFixed(2)}% YoY.`);
    } else if (cpiObs >= 1.0 && cpiObs < 2.5) {
      score = 75;
      observationsVi.push(`Lạm phát CPI ở mức thấp: ${cpiObs.toFixed(2)}% YoY.`);
    } else if (cpiObs < 0) {
      score = 25;
      observationsVi.push(`Nguy cơ giảm phát: CPI âm (${cpiObs.toFixed(2)}% YoY).`);
    }

    // 2. Momentum Adjustments
    if (cpiMomentum !== null) {
      if (cpiMomentum > 0.3) {
        score -= 15;
        observationsVi.push(`Đà lạm phát đang tăng tốc (+${cpiMomentum.toFixed(2)} điểm % so với kỳ trước).`);
      } else if (cpiMomentum < -0.3) {
        score += 10;
        observationsVi.push(`Đà lạm phát đang hạ nhiệt rõ nét (${cpiMomentum.toFixed(2)} điểm % so với kỳ trước).`);
      }
    }

    // 3. Core CPI Confirmation
    if (coreCpiObs !== null) {
      if (coreCpiObs >= 3.8) {
        score -= 10;
        observationsVi.push(`Lạm phát cơ bản neo cao: ${coreCpiObs.toFixed(2)}% YoY.`);
      }
    }

    const inflationScore = Math.max(0, Math.min(100, score));

    let state: InflationState = 'STABLE';
    if (cpiObs < 0) {
      state = 'DEFLATION_RISK';
    } else if (cpiObs >= 4.5) {
      state = 'HIGH_INFLATION';
    } else if (cpiObs >= 3.8 || (cpiMomentum !== null && cpiMomentum > 0.4)) {
      state = 'RISING';
    } else if (cpiMomentum !== null && cpiMomentum < -0.25) {
      state = 'DISINFLATION';
    } else {
      state = 'STABLE';
    }

    return {
      state,
      inflationScore,
      observationsVi,
      missingMetrics,
    };
  }
}
