/**
 * PHASE 27 — FINANCIAL CONDITIONS STATE ENGINE
 * ============================================
 * Evaluates bond yield curve slopes, interbank rates, and risk volatility:
 *   - US 10Y Yield (%)
 *   - US 2Y Yield (%) -> Yield Curve (10Y - 2Y Spread in bps)
 *   - Global VIX
 *   - Domestic 10Y Government Bond Yield (where available)
 *
 * STATES:
 *   - LOOSE: Low yields, upward sloping curve, low volatility
 *   - BALANCED: Normal yields and volatility
 *   - TIGHT: Rising yields, flattening yield curve
 *   - STRESSED: Inverted yield curve or severe volatility spike
 *   - UNKNOWN: Missing yields/volatility inputs
 */

import type { NormalizedMacroObservation, FinancialConditionsState } from './types.ts';

export class FinancialConditionsEngine {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Classifies Financial Conditions State deterministically.
   */
  public static evaluate(observations: readonly NormalizedMacroObservation[]): {
    state: FinancialConditionsState;
    financialConditionsScore: number | null; // 0 = severe stress, 100 = highly loose
    yieldCurveSpreadBps: number | null;
    observationsVi: string[];
    missingMetrics: string[];
  } {
    const obsMap = new Map<string, NormalizedMacroObservation>(
      observations.map((o) => [o.metricCode.toUpperCase(), o])
    );

    const us10y = obsMap.get('US_10Y_YIELD')?.normalizedValue ?? null;
    const us2y = obsMap.get('US_2Y_YIELD')?.normalizedValue ?? null;
    const vix = obsMap.get('GLOBAL_VIX')?.normalizedValue ?? null;

    const observationsVi: string[] = [];
    const missingMetrics: string[] = [];

    if (us10y === null && vix === null) {
      missingMetrics.push('US_10Y_YIELD', 'GLOBAL_VIX');
      return {
        state: 'UNKNOWN',
        financialConditionsScore: null,
        yieldCurveSpreadBps: null,
        observationsVi: ['Thiếu dữ liệu lợi suất trái phiếu và chỉ số biến động VIX.'],
        missingMetrics,
      };
    }

    let score = 55;
    let yieldCurveSpreadBps: number | null = null;

    // 1. Yield Curve Spread (10Y - 2Y)
    if (us10y !== null && us2y !== null) {
      yieldCurveSpreadBps = Math.round((us10y - us2y) * 100);
      if (yieldCurveSpreadBps < 0) {
        score -= 25;
        observationsVi.push(`Đường cong lợi suất đảo ngược (${yieldCurveSpreadBps} bps), phát tín hiệu thận trọng chu kỳ.`);
      } else if (yieldCurveSpreadBps >= 25) {
        score += 15;
        observationsVi.push(`Đường cong lợi suất dốc dương lành mạnh (+${yieldCurveSpreadBps} bps).`);
      } else {
        observationsVi.push(`Đường cong lợi suất ở trạng thái phẳng (+${yieldCurveSpreadBps} bps).`);
      }
    }

    // 2. 10Y Absolute Level
    if (us10y !== null) {
      if (us10y >= 4.5) {
        score -= 15;
        observationsVi.push(`Lợi suất TPCP 10Y neo ở mức cao (${us10y.toFixed(2)}%), làm tăng chi phí vốn chiết khấu.`);
      } else if (us10y <= 3.8) {
        score += 15;
        observationsVi.push(`Lợi suất TPCP 10Y giảm về mức hấp dẫn (${us10y.toFixed(2)}%).`);
      }
    }

    // 3. Volatility Index (VIX)
    if (vix !== null) {
      if (vix >= 25.0) {
        score -= 30;
        observationsVi.push(`Chỉ số biến động VIX tăng vọt (${vix.toFixed(1)} điểm), tâm lý e ngại rủi ro cao.`);
      } else if (vix <= 15.0) {
        score += 15;
        observationsVi.push(`Chỉ số biến động VIX ở mức thấp (${vix.toFixed(1)} điểm), tâm lý ổn định.`);
      }
    }

    const financialConditionsScore = Math.max(0, Math.min(100, score));

    let state: FinancialConditionsState = 'BALANCED';
    if (financialConditionsScore >= 75) {
      state = 'LOOSE';
    } else if (financialConditionsScore <= 30 || (vix !== null && vix >= 30)) {
      state = 'STRESSED';
    } else if (financialConditionsScore <= 45) {
      state = 'TIGHT';
    } else {
      state = 'BALANCED';
    }

    return {
      state,
      financialConditionsScore,
      yieldCurveSpreadBps,
      observationsVi,
      missingMetrics,
    };
  }
}
