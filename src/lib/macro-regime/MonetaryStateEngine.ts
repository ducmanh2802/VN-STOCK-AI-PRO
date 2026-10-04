/**
 * PHASE 27 — MONETARY & LIQUIDITY STATE ENGINE
 * ============================================
 * Evaluates Central Bank policy stance and money-market rates:
 *   - SBV Refinancing Rate (%)
 *   - SBV OMO Rate (%)
 *   - 12M Deposit Rate (%)
 *   - Policy Trajectory & Rate Changes
 *
 * STATES:
 *   - EASING: Rate cuts, accommodative liquidity
 *   - NEUTRAL: Stable policy rates, balanced market rates
 *   - TIGHTENING: Rate hikes or liquidity absorption
 *   - RESTRICTIVE: Prolonged high policy rates
 *   - UNKNOWN: Missing policy rate observations
 */

import type { NormalizedMacroObservation, MonetaryState } from './types.ts';

export class MonetaryStateEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Classifies Monetary State deterministically.
   */
  public static evaluate(observations: readonly NormalizedMacroObservation[]): {
    state: MonetaryState;
    monetaryScore: number | null; // 0 = very restrictive, 100 = very accommodative
    observationsVi: string[];
    missingMetrics: string[];
  } {
    const obsMap = new Map<string, NormalizedMacroObservation>(
      observations.map((o) => [o.metricCode.toUpperCase(), o])
    );

    const refiRate = obsMap.get('SBV_REFINANCING_RATE')?.normalizedValue ?? null;
    const omoRate = obsMap.get('SBV_OMO_RATE')?.normalizedValue ?? null;
    const depositRate = obsMap.get('VN_DEPOSIT_RATE')?.normalizedValue ?? null;
    const refiMomentum = obsMap.get('SBV_REFINANCING_RATE')?.momentum ?? null;

    const observationsVi: string[] = [];
    const missingMetrics: string[] = [];

    if (refiRate === null && depositRate === null) {
      missingMetrics.push('SBV_REFINANCING_RATE', 'VN_DEPOSIT_RATE');
      return {
        state: 'UNKNOWN',
        monetaryScore: null,
        observationsVi: ['Thiếu dữ liệu lãi suất điều hành và lãi suất huy động.'],
        missingMetrics,
      };
    }

    let score = 50; // Neutral baseline

    if (refiRate !== null) {
      if (refiRate <= 4.5) {
        score += 25;
        observationsVi.push(`Lãi suất tái cấp vốn duy trì ở mức nới lỏng: ${refiRate.toFixed(2)}%.`);
      } else if (refiRate >= 6.0) {
        score -= 30;
        observationsVi.push(`Lãi suất tái cấp vốn ở mức thắt chặt: ${refiRate.toFixed(2)}%.`);
      } else {
        observationsVi.push(`Lãi suất tái cấp vốn ở mức trung lập: ${refiRate.toFixed(2)}%.`);
      }
    }

    if (depositRate !== null) {
      if (depositRate <= 5.0) {
        score += 15;
        observationsVi.push(`Lãi suất huy động 12 tháng ở mức thấp: ${depositRate.toFixed(2)}%.`);
      } else if (depositRate >= 7.0) {
        score -= 20;
        observationsVi.push(`Lãi suất huy động 12 tháng tăng cao: ${depositRate.toFixed(2)}%.`);
      }
    }

    if (refiMomentum !== null) {
      if (refiMomentum < -0.25) {
        score += 15;
        observationsVi.push('Ngân hàng Nhà nước vừa cắt giảm lãi suất điều hành.');
      } else if (refiMomentum > 0.25) {
        score -= 20;
        observationsVi.push('Ngân hàng Nhà nước vừa tăng lãi suất điều hành.');
      }
    }

    const monetaryScore = Math.max(0, Math.min(100, score));

    let state: MonetaryState = 'NEUTRAL';
    if (monetaryScore >= 75) {
      state = 'EASING';
    } else if (monetaryScore <= 30) {
      state = 'RESTRICTIVE';
    } else if (monetaryScore <= 45) {
      state = 'TIGHTENING';
    } else {
      state = 'NEUTRAL';
    }

    return {
      state,
      monetaryScore,
      observationsVi,
      missingMetrics,
    };
  }
}
