/**
 * PHASE 27 — EXTERNAL SECTOR STATE ENGINE
 * =======================================
 * Evaluates foreign exchange pressure, DXY strength, and trade dynamics:
 *   - USD/VND Interbank Exchange Rate
 *   - US Dollar Index (DXY)
 *   - Trade Balance (Surplus/Deficit)
 *
 * STATES:
 *   - FAVORABLE: Stable/strengthening VND, DXY softening, trade surplus
 *   - NEUTRAL: FX moves within standard band
 *   - PRESSURE: DXY spike, VND depreciation pressure
 *   - CRITICAL: Severe FX pressure, sharp currency depreciation
 *   - UNKNOWN: Missing FX inputs
 */

import type { NormalizedMacroObservation, ExternalSectorState } from './types.ts';

export class ExternalSectorEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Classifies External Sector State deterministically.
   */
  public static evaluate(observations: readonly NormalizedMacroObservation[]): {
    state: ExternalSectorState;
    externalScore: number | null; // 0 = severe FX stress, 100 = highly favorable
    observationsVi: string[];
    missingMetrics: string[];
  } {
    const obsMap = new Map<string, NormalizedMacroObservation>(
      observations.map((o) => [o.metricCode.toUpperCase(), o])
    );

    const dxy = obsMap.get('US_DXY')?.normalizedValue ?? null;
    const usdVnd = obsMap.get('USD_VND')?.normalizedValue ?? null;
    const dxyTrend = obsMap.get('US_DXY')?.trend ?? 'UNKNOWN';
    const usdVndMomentum = obsMap.get('USD_VND')?.momentum ?? null;

    const observationsVi: string[] = [];
    const missingMetrics: string[] = [];

    if (dxy === null && usdVnd === null) {
      missingMetrics.push('US_DXY', 'USD_VND');
      return {
        state: 'UNKNOWN',
        externalScore: null,
        observationsVi: ['Thiếu dữ liệu tỷ giá USD/VND và chỉ số DXY.'],
        missingMetrics,
      };
    }

    let score = 55; // Neutral baseline

    if (dxy !== null) {
      if (dxy >= 106.0) {
        score -= 30;
        observationsVi.push(`Chỉ số DXY ở mức rất cao (${dxy.toFixed(1)} điểm), gây sức ép lớn lên tỷ giá toàn cầu.`);
      } else if (dxy >= 104.0) {
        score -= 15;
        observationsVi.push(`Chỉ số DXY neo cao (${dxy.toFixed(1)} điểm), tạo áp lực tỷ giá ngắn hạn.`);
      } else if (dxy <= 101.0) {
        score += 25;
        observationsVi.push(`Chỉ số DXY hạ nhiệt (${dxy.toFixed(1)} điểm), giảm thiểu áp lực tỷ giá.`);
      } else {
        score += 5;
        observationsVi.push(`Chỉ số DXY ở mức cân bằng (${dxy.toFixed(1)} điểm).`);
      }
    }

    if (usdVndMomentum !== null && usdVndMomentum > 100) {
      score -= 15;
      observationsVi.push(`Tỷ giá USD/VND biến động tăng nhanh (+${usdVndMomentum.toFixed(0)} VND).`);
    }

    const externalScore = Math.max(0, Math.min(100, score));

    let state: ExternalSectorState = 'NEUTRAL';
    if (externalScore >= 75) {
      state = 'FAVORABLE';
    } else if (externalScore <= 30) {
      state = 'CRITICAL';
    } else if (externalScore <= 45) {
      state = 'PRESSURE';
    } else {
      state = 'NEUTRAL';
    }

    return {
      state,
      externalScore,
      observationsVi,
      missingMetrics,
    };
  }
}
