/**
 * PHASE 27 — MACRO REGIME & ECONOMIC CYCLE INTELLIGENCE: DOMAIN CONTRACTS
 * ========================================================================
 * Deterministic, source-backed, fail-closed contracts for:
 *   - Macroeconomic Observations & Vintages
 *   - 5 Independent Economic Sub-States (Growth, Inflation, Monetary, External, Financial Conditions)
 *   - Growth x Inflation Quadrant Macro Regime Classification
 *   - Regime Transition Detection & Historical Persistence
 *   - Strict Publication Date / Lookahead Protection (publicationDate <= asOfDate)
 *
 * NON-NEGOTIABLE INVARIANTS:
 *   1. `null` ALWAYS means "unavailable / not reported" — NEVER 0, NEVER a guess.
 *   2. Macro regimes are analytical context layers, NEVER direct BUY/SELL signals.
 *   3. AI never determines the regime; AI is purely an explanatory translation layer.
 *   4. Independent from Phase 26; Phase 27 evaluates purely from macro data feeds.
 *   5. Adopt PR-01 DataFreshnessStatus ('CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID').
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';

export type { DataFreshnessStatus };

// ============================================================================
// 1. SOURCE PROVENANCE & VALIDATION CONTRACTS
// ============================================================================

export type MacroSourceTier =
  | 'TIER_1_STATUTORY'   // GSO, SBV, Ministry of Finance, US Fed, US Treasury, National Statistics
  | 'TIER_2_EXCHANGE'    // S&P Global, ICE, LBMA, VBMA, HNX
  | 'TIER_3_SECONDARY'   // World Bank, IMF, Bloomberg/Reuters consensus
  | 'TIER_4_UNVERIFIED'; // Social media / unofficial commentary (CANNOT enter deterministic models)

export type MacroValidationStatus =
  | 'VALID'              // Verified against primary statutory release
  | 'PROVISIONAL'        // Preliminary flash estimate pending official audit
  | 'SUSPECT'            // Anomalous discrepancy exceeding sanity thresholds
  | 'INVALID';           // Failed numeric/schema validation (fails closed)

export type MacroFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'EVENT_DRIVEN';

export interface MacroObservation {
  readonly metricCode: string;
  readonly observationDate: string; // ISO YYYY-MM-DD (End of period observed, e.g. 2024-06-30 for Q2)
  readonly publicationDate: string; // ISO YYYY-MM-DD (Date officially released to public)
  readonly retrievalDate: string;   // ISO YYYY-MM-DD (Date ingested into system)
  readonly value: number | null;
  readonly unit: string;            // e.g. '% YoY', '% YTD', 'VND', 'USD/bbl', 'Points', 'bps'
  readonly source: string;
  readonly sourceTier: MacroSourceTier;
  readonly revisionVersion: number; // 0 = initial release, 1 = first revision, etc.
  readonly frequency: MacroFrequency;
  readonly periodId?: string | null;// e.g. '2024-Q2', '2024-09'
  readonly validationStatus: MacroValidationStatus;
  readonly freshnessStatus: DataFreshnessStatus;
  readonly notes?: string | null;
}

export interface NormalizedMacroObservation {
  readonly metricCode: string;
  readonly observation: MacroObservation;
  readonly normalizedValue: number | null;
  readonly momentum: number | null; // e.g. change vs prior period or 3M vs 12M
  readonly trend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
  readonly zScore?: number | null;
  readonly percentile?: number | null;
  readonly isValid: boolean;
}

// ============================================================================
// 2. ECONOMIC SUB-STATE CONTRACTS
// ============================================================================

/**
 * 1. Growth State (Real GDP, IIP, PMI, Retail Sales, Exports, FDI, Public Investment)
 */
export type GrowthState =
  | 'ACCELERATING'   // Tăng tốc: Tăng trưởng bứt phá mạnh, PMI > 52, IIP & xuất khẩu mở rộng
  | 'EXPANDING'      // Mở rộng: Tăng trưởng vững chắc trên tiềm năng, các chỉ báo kinh tế dương
  | 'STABLE'         // Ổn định: Tăng trưởng đi ngang quanh mức tiềm năng
  | 'SLOWING'        // Giảm tốc: Tăng trưởng chậm lại, PMI dưới 50 hoặc đà xuất khẩu suy yếu
  | 'CONTRACTING'    // Suy thoái / Thu hẹp: GDP/IIP âm hoặc suy giảm diện rộng
  | 'UNKNOWN';       // Thiếu dữ liệu cấu thành trọng yếu

/**
 * 2. Inflation State (Headline CPI, Core CPI, Price Momentum)
 */
export type InflationState =
  | 'DISINFLATION'   // Giảm lạm phát: Tốc độ tăng giá chậm dần, đà lạm phát hạ nhiệt
  | 'STABLE'         // Lạm phát ổn định: CPI nằm trong mục tiêu kiểm soát (e.g. 2.5% - 3.8%)
  | 'RISING'         // Lạm phát gia tăng: CPI tăng tốc, áp lực chi phí đẩy xuất hiện
  | 'HIGH_INFLATION' // Lạm phát cao: CPI vượt ngưỡng kiểm soát mục tiêu (> 4.5%)
  | 'DEFLATION_RISK' // Nguy cơ giảm phát: CPI âm hoặc đình đốn sức cầu nghiêm trọng
  | 'UNKNOWN';

/**
 * 3. Monetary & Liquidity State (SBV Refinancing, Discount, OMO, Deposit Rates, Interbank)
 */
export type MonetaryState =
  | 'EASING'         // Nới lỏng: Cắt giảm lãi suất điều hành, bơm thanh khoản, hỗ trợ tín dụng
  | 'NEUTRAL'        // Trung lập: Duy trì mặt bằng lãi suất và thanh khoản cân bằng
  | 'TIGHTENING'     // Thắt chặt: Tăng lãi suất điều hành, hút thanh khoản qua OMO / T-Bills
  | 'RESTRICTIVE'    // Thắt chặt mạnh: Lãi suất neo cao kéo dài, tín dụng bị kiểm soát chặt
  | 'UNKNOWN';

/**
 * 4. External Sector State (USD/VND, DXY, Trade Balance, FX Reserves Pressure)
 */
export type ExternalSectorState =
  | 'FAVORABLE'      // Thuận lợi: Thặng dư thương mại lớn, DXY giảm, tỷ giá ổn định
  | 'NEUTRAL'        // Cân bằng: Tỷ giá biến động trong biên độ cho phép, cán cân ổn định
  | 'PRESSURE'       // Áp lực tỷ giá: DXY tăng cao, VND chịu áp lực mất giá ngắn hạn
  | 'CRITICAL'       // Căng thẳng tỷ giá nghiêm trọng: Tỷ giá kịch trần, can thiệp ngoại hối mạnh
  | 'UNKNOWN';

/**
 * 5. Financial Conditions State (10Y Yield, Yield Curve 10Y-2Y, Interbank Spread)
 */
export type FinancialConditionsState =
  | 'LOOSE'          // Điều kiện tài chính nới lỏng: Lợi suất TPCP thấp, đường cong dốc dương
  | 'BALANCED'       // Điều kiện tài chính bình thường
  | 'TIGHT'          // Điều kiện tài chính bị siết: Lợi suất TPCP tăng, thanh khoản liên ngân hàng căng
  | 'STRESSED'       // Căng thẳng tài chính: Đường cong lợi suất đảo ngược hoặc lãi suất LNH vọt
  | 'UNKNOWN';

// ============================================================================
// 3. MACRO REGIME CLASSIFICATION CONTRACTS
// ============================================================================

/**
 * The 6 Canonical Macroeconomic Quadrant Regimes.
 * Strictly an analytical regime classification — NOT a recommendation.
 */
export type MacroRegime =
  | 'EXPANSION'              // Mở rộng kinh tế (Goldilocks): Tăng trưởng cao + Lạm phát ổn định/thấp
  | 'INFLATIONARY_EXPANSION'  // Mở rộng kèm lạm phát: Tăng trưởng tốt nhưng áp lực lạm phát/chi phí đẩy tăng
  | 'STAGFLATION_RISK'       // Rủi ro đình lạm: Tăng trưởng suy giảm trong khi lạm phát neo cao
  | 'RECESSION'              // Suy thoái / Thu hẹp: Tăng trưởng âm/suy sụp kèm giảm phát/cầu yếu
  | 'RECOVERY'               // Phục hồi: Khởi đầu chu kỳ mới, tăng trưởng tạo đáy đi lên, lạm phát thấp
  | 'SLOWDOWN'               // Giảm tốc: Tăng trưởng hạ nhiệt về mức bình thường, lạm phát ổn định
  | 'UNKNOWN';               // Thiếu dữ liệu cấu thành bắt buộc

export type MacroDataCoverage =
  | 'FULL'          // 100% các chỉ báo trọng yếu có dữ liệu hợp lệ
  | 'SUFFICIENT'    // >= 75% chỉ báo có dữ liệu, đủ kết luận chắc chắn
  | 'PARTIAL'       // 50% - 74% chỉ báo có dữ liệu, độ tin cậy hạn chế
  | 'INSUFFICIENT'  // < 50% chỉ báo có dữ liệu, fail-closed sang UNKNOWN
  | 'UNAVAILABLE';  // Hoàn toàn không có dữ liệu vĩ mô

export interface MacroClassificationDiagnostics {
  readonly growthScore: number | null;          // 0 - 100
  readonly inflationScore: number | null;       // 0 - 100
  readonly monetaryScore: number | null;        // 0 - 100
  readonly externalScore: number | null;        // 0 - 100
  readonly financialConditionsScore: number | null; // 0 - 100
  readonly primaryQuadrant: string;
  readonly keyObservations: readonly string[];
  readonly missingMetrics: readonly string[];
}

export interface RegimeTransition {
  readonly previousRegime: MacroRegime;
  readonly currentRegime: MacroRegime;
  readonly transitionDate: string; // ISO YYYY-MM-DD
  readonly persistencePeriods: number; // Số kỳ liên tiếp duy trì regime hiện tại
  readonly isShift: boolean; // TRUE nếu currentRegime !== previousRegime
  readonly shiftDescriptionVi: string;
}

// ============================================================================
// 4. MASTER PHASE 27 MACRO REGIME SNAPSHOT
// ============================================================================

export interface MacroRegimeSnapshot {
  readonly snapshotId: string;
  readonly asOfDate: string;                  // Evaluation date (YYYY-MM-DD)
  readonly publicationCutoffDate: string;     // Must equal asOfDate for lookahead safety
  readonly evaluatedAt: string;               // ISO-8601 timestamp
  readonly macroRegime: MacroRegime;
  readonly growthState: GrowthState;
  readonly inflationState: InflationState;
  readonly monetaryState: MonetaryState;
  readonly externalSectorState: ExternalSectorState;
  readonly financialConditionsState: FinancialConditionsState;
  readonly dataCoverage: MacroDataCoverage;
  readonly confidencePercent: number;         // 0 - 100
  readonly diagnostics: MacroClassificationDiagnostics;
  readonly transition: RegimeTransition;
  readonly activeObservations: readonly NormalizedMacroObservation[];
  readonly dataFreshness: DataFreshnessStatus;
  readonly classificationVersion: string;     // e.g. 'v1.0.0-phase27'
  readonly lookaheadRejected: boolean;
  readonly lookaheadViolations: readonly string[];
  readonly rationaleVi: string;
}
