/**
 * PHASE 27 — MACRO REGIME CLASSIFIER
 * ===================================
 * Deterministically classifies the prevailing macroeconomic quadrant from:
 *   - Growth State (Accelerating, Expanding, Stable, Slowing, Contracting)
 *   - Inflation State (Disinflation, Stable, Rising, High Inflation, Deflation Risk)
 * conditioned by Monetary, External, and Financial Conditions.
 *
 * REGIMES:
 *   - EXPANSION (Goldilocks): Accelerating/Expanding Growth + Stable/Disinflation
 *   - INFLATIONARY_EXPANSION: Expanding Growth + Rising/High Inflation
 *   - STAGFLATION_RISK: Slowing/Contracting Growth + Rising/High Inflation
 *   - RECESSION: Contracting Growth + Disinflation/Deflation Risk
 *   - RECOVERY: Early Growth Turnaround + Falling Inflation
 *   - SLOWDOWN: Slowing Growth + Stable Inflation
 *   - UNKNOWN: Insufficient critical data
 */

import type {
  GrowthState,
  InflationState,
  MonetaryState,
  ExternalSectorState,
  FinancialConditionsState,
  MacroRegime,
  MacroDataCoverage,
  MacroClassificationDiagnostics,
} from './types.ts';

export interface ClassifyRegimeInput {
  readonly growthState: GrowthState;
  readonly inflationState: InflationState;
  readonly monetaryState: MonetaryState;
  readonly externalState: ExternalSectorState;
  readonly financialConditionsState: FinancialConditionsState;
  readonly growthScore: number | null;
  readonly inflationScore: number | null;
  readonly monetaryScore: number | null;
  readonly externalScore: number | null;
  readonly financialConditionsScore: number | null;
  readonly missingMetrics: readonly string[];
  readonly allObservationsVi: readonly string[];
}

export class MacroRegimeClassifier {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Required macro metric registry (P27-D6): the 9 metric codes the five
   * sub-state engines report as missing when absent. Coverage is measured
   * against this FIXED reportable set — never an ad-hoc denominator.
   * Coincident/secondary codes (IIP, retail, export, FDI, core CPI, US 2Y,
   * OMO) enhance scoring but do not affect coverage accounting.
   */
  public static readonly REQUIRED_METRIC_CODES: readonly string[] = [
    'VN_GDP_GROWTH',
    'VN_PMI',
    'VN_CPI',
    'SBV_REFINANCING_RATE',
    'VN_DEPOSIT_RATE',
    'US_DXY',
    'USD_VND',
    'US_10Y_YIELD',
    'GLOBAL_VIX',
  ];

  /**
   * Evaluates data coverage quality before classification.
   * Thresholds match the MacroDataCoverage contract exactly (P27-D6):
   * FULL = 100%, SUFFICIENT >= 75%, PARTIAL 50–74%, INSUFFICIENT < 50%
   * (non-empty), UNAVAILABLE = no data. The GDP+CPI joint gate is retained:
   * without both core metrics no confident cycle call is possible.
   */
  public static evaluateCoverage(
    missingMetrics: readonly string[],
    totalExpectedMetrics: number = MacroRegimeClassifier.REQUIRED_METRIC_CODES.length
  ): MacroDataCoverage {
    const presentCount = Math.max(0, totalExpectedMetrics - missingMetrics.length);
    const ratio = presentCount / totalExpectedMetrics;

    if (missingMetrics.includes('VN_GDP_GROWTH') && missingMetrics.includes('VN_CPI')) {
      return 'INSUFFICIENT';
    }
    if (ratio >= 1.0) return 'FULL';
    if (ratio >= 0.75) return 'SUFFICIENT';
    if (ratio >= 0.5) return 'PARTIAL';
    if (ratio > 0) return 'INSUFFICIENT';
    return 'UNAVAILABLE';
  }

  /**
   * Classifies the deterministic macro regime.
   */
  public static classify(input: ClassifyRegimeInput): {
    macroRegime: MacroRegime;
    dataCoverage: MacroDataCoverage;
    confidencePercent: number;
    diagnostics: MacroClassificationDiagnostics;
    rationaleVi: string;
  } {
    const {
      growthState,
      inflationState,
      monetaryState,
      externalState,
      financialConditionsState,
      growthScore,
      inflationScore,
      monetaryScore,
      externalScore,
      financialConditionsScore,
      missingMetrics,
      allObservationsVi,
    } = input;

    const coverage = this.evaluateCoverage(missingMetrics);

    // Fail-closed if coverage is insufficient or key dimensions are UNKNOWN
    if (coverage === 'INSUFFICIENT' || coverage === 'UNAVAILABLE' || growthState === 'UNKNOWN' || inflationState === 'UNKNOWN') {
      return {
        macroRegime: 'UNKNOWN',
        dataCoverage: coverage,
        confidencePercent: 0,
        diagnostics: {
          growthScore,
          inflationScore,
          monetaryScore,
          externalScore,
          financialConditionsScore,
          primaryQuadrant: 'UNKNOWN',
          keyObservations: ['Dữ liệu vĩ mô không đủ để xác định chu kỳ tin cậy.'],
          missingMetrics,
        },
        rationaleVi: 'Thiếu các dữ liệu kinh tế vĩ mô cốt lõi (GDP / CPI) để phân loại chu kỳ kinh tế.',
      };
    }

    let regime: MacroRegime = 'EXPANSION';
    let quadrant = 'GOLDILOCKS_EXPANSION';
    let rationale = '';

    // ========================================================================
    // QUADRANT MATRIX EVALUATION (Growth x Inflation)
    // ========================================================================

    if (growthState === 'CONTRACTING') {
      if (inflationState === 'HIGH_INFLATION' || inflationState === 'RISING') {
        regime = 'STAGFLATION_RISK';
        quadrant = 'STAGFLATION_QUADRANT';
        rationale = 'Kinh tế suy thoái kết hợp với lạm phát cao (Đình lạm): Tăng trưởng thu hẹp trong khi chi phí giá cả neo cao, tạo áp lực lớn lên chính sách tiền tệ.';
      } else {
        regime = 'RECESSION';
        quadrant = 'RECESSION_QUADRANT';
        rationale = 'Chu kỳ thu hẹp / suy thoái: Tăng trưởng kinh tế giảm sâu, tổng cầu suy yếu và lạm phát thấp.';
      }
    } else if (growthState === 'SLOWING') {
      if (inflationState === 'HIGH_INFLATION' || inflationState === 'RISING') {
        regime = 'STAGFLATION_RISK';
        quadrant = 'STAGFLATION_WARNING_QUADRANT';
        rationale = 'Cảnh báo đình lạm: Tăng trưởng hạ nhiệt rõ nét trong khi lạm phát có xu hướng tăng tốc.';
      } else {
        regime = 'SLOWDOWN';
        quadrant = 'MID_CYCLE_SLOWDOWN_QUADRANT';
        rationale = 'Chu kỳ giảm tốc giữa chu kỳ: Tăng trưởng kinh tế hạ nhiệt về mức bình thường, áp lực lạm phát vẫn trong tầm kiểm soát.';
      }
    } else if (growthState === 'EXPANDING' || growthState === 'ACCELERATING') {
      if (inflationState === 'HIGH_INFLATION' || inflationState === 'RISING') {
        regime = 'INFLATIONARY_EXPANSION';
        quadrant = 'OVERHEATING_EXPANSION_QUADRANT';
        rationale = 'Mở rộng kinh tế kèm lạm phát: Hoạt động sản xuất kinh doanh tăng trưởng mạnh nhưng áp lực lạm phát chi phí đẩy gia tăng.';
      } else {
        regime = 'EXPANSION';
        quadrant = 'GOLDILOCKS_EXPANSION_QUADRANT';
        rationale = 'Môi trường kinh tế mở rộng lý tưởng (Goldilocks): Tăng trưởng kinh tế vững chắc đi kèm lạm phát thấp và ổn định.';
      }
    } else {
      // growthState === 'STABLE'
      if (inflationState === 'DISINFLATION' && monetaryState === 'EASING') {
        regime = 'RECOVERY';
        quadrant = 'EARLY_RECOVERY_QUADRANT';
        rationale = 'Chu kỳ phục hồi sớm: Lạm phát hạ nhiệt tạo dư địa cho nới lỏng chính sách tiền tệ, nền kinh tế tạo đáy đi lên.';
      } else if (inflationState === 'HIGH_INFLATION') {
        regime = 'INFLATIONARY_EXPANSION';
        quadrant = 'INFLATION_PRESSURE_QUADRANT';
        rationale = 'Môi trường chịu áp lực lạm phát cao dù tăng trưởng ở mức trung bình.';
      } else {
        regime = 'EXPANSION';
        quadrant = 'STABLE_EXPANSION_QUADRANT';
        rationale = 'Kinh tế vận động ở trạng thái mở rộng ổn định, cân bằng giữa tăng trưởng và lạm phát.';
      }
    }

    // Adjust confidence based on coverage and secondary stability
    let baseConfidence = coverage === 'FULL' ? 95 : coverage === 'SUFFICIENT' ? 85 : 70;
    if (externalState === 'CRITICAL' || financialConditionsState === 'STRESSED') {
      baseConfidence = Math.max(50, baseConfidence - 10);
    }

    return {
      macroRegime: regime,
      dataCoverage: coverage,
      confidencePercent: baseConfidence,
      diagnostics: {
        growthScore,
        inflationScore,
        monetaryScore,
        externalScore,
        financialConditionsScore,
        primaryQuadrant: quadrant,
        keyObservations: allObservationsVi,
        missingMetrics,
      },
      rationaleVi: rationale,
    };
  }
}
