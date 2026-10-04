/**
 * PHASE 25+ — MACRO REGIME ENGINE
 * =================================
 * Deterministic weighted model evaluating the prevailing Macroeconomic Regime.
 * Evaluates 6 sub-dimensions:
 *   1. Liquidity (25%): Interbank rates, credit growth, SBV OMO posture
 *   2. Interest Rates (20%): Fed Funds, US10Y, domestic deposit & refinancing rates
 *   3. FX Pressure (20%): DXY strength, USD/VND central rate divergence
 *   4. Commodities & Inflation (15%): Brent crude, domestic CPI, raw materials
 *   5. Global Risk (10%): VIX volatility index, global equity momentum
 *   6. Foreign Flow (10%): Net foreign trading on HOSE/HNX
 *
 * Invariants:
 *   - Strictly deterministic, mathematical weighting
 *   - Fully explainable: produces explicit sub-scores and Vietnamese rationale
 *   - Missing inputs fail closed to neutral/unknown without hallucinating numbers
 */

import type { DataFreshnessStatus, MacroMetricRecord, MacroRegimeResult, MacroRegimeType } from './types.ts';

export class MacroRegimeEngine {
  /**
   * Calculates the Macro Market Regime based on real macro indicators.
   *
   * Fail-closed (P27-D2-legacy): when NO metric carries a usable value the
   * result is UNKNOWN with zero confidence and UNAVAILABLE freshness. The
   * neutral-prior sub-scores are structural defaults, never measurements —
   * no regime call is made from an empty feed.
   */
  public static calculateRegime(
    metrics: readonly MacroMetricRecord[],
    asOfDate: string = new Date().toISOString().slice(0, 10)
  ): MacroRegimeResult {
    const metricMap = new Map<string, MacroMetricRecord>(
      metrics.map((m) => [m.code.toUpperCase(), m])
    );

    // 1. Sub-dimension 1: Liquidity (0 = extreme tight, 100 = massive expansion)
    const omo = metricMap.get('SBV_OMO_RATE')?.value ?? null;
    const creditGrowth = metricMap.get('VN_CREDIT_GROWTH')?.value ?? null;
    const m2 = metricMap.get('VN_M2_GROWTH')?.value ?? null;

    let liquidityScore = 50; // Neutral baseline
    if (creditGrowth !== null && creditGrowth >= 14) liquidityScore += 20;
    else if (creditGrowth !== null && creditGrowth < 10) liquidityScore -= 15;
    if (m2 !== null && m2 >= 10) liquidityScore += 15;
    if (omo !== null && omo <= 4.5) liquidityScore += 10;
    else if (omo !== null && omo > 5.5) liquidityScore -= 20;
    liquidityScore = Math.max(0, Math.min(100, liquidityScore));

    // 2. Sub-dimension 2: Interest Rates (0 = very high/restrictive, 100 = very low/loose)
    const fedFunds = metricMap.get('FED_FUNDS_RATE')?.value ?? null;
    const us10y = metricMap.get('US_10Y_YIELD')?.value ?? null;
    const vnDeposit = metricMap.get('VN_DEPOSIT_RATE')?.value ?? null;
    const vnRefinancing = metricMap.get('SBV_REFINANCING_RATE')?.value ?? null;

    let ratesScore = 50;
    if (fedFunds !== null && fedFunds >= 5.0) ratesScore -= 20;
    else if (fedFunds !== null && fedFunds < 4.0) ratesScore += 20;
    if (us10y !== null && us10y >= 4.5) ratesScore -= 15;
    else if (us10y !== null && us10y < 3.8) ratesScore += 15;
    if (vnRefinancing !== null && vnRefinancing <= 4.5) ratesScore += 15;
    ratesScore = Math.max(0, Math.min(100, ratesScore));

    // 3. Sub-dimension 3: FX Pressure (0 = extreme USD pressure/depreciation, 100 = stable/strong VND)
    const dxy = metricMap.get('US_DXY')?.value ?? null;
    const dxyChange = metricMap.get('US_DXY')?.changePercent ?? 0;
    const usdVnd = metricMap.get('USD_VND')?.value ?? null;

    let fxScore = 55;
    if (dxy !== null && dxy >= 105) fxScore -= 25;
    else if (dxy !== null && dxy <= 101) fxScore += 25;
    if (dxyChange > 0.5) fxScore -= 10;
    else if (dxyChange < -0.5) fxScore += 10;
    fxScore = Math.max(0, Math.min(100, fxScore));

    // 4. Sub-dimension 4: Commodities & Cost-Push Inflation (0 = high inflation, 100 = low/favorable)
    const brent = metricMap.get('BRENT_OIL')?.value ?? null;
    const vnCpi = metricMap.get('VN_CPI')?.value ?? null;

    let commoditiesScore = 60;
    if (brent !== null && brent >= 90) commoditiesScore -= 30;
    else if (brent !== null && brent <= 75) commoditiesScore += 20;
    if (vnCpi !== null && vnCpi >= 4.0) commoditiesScore -= 20;
    else if (vnCpi !== null && vnCpi < 3.0) commoditiesScore += 15;
    commoditiesScore = Math.max(0, Math.min(100, commoditiesScore));

    // 5. Sub-dimension 5: Global Risk (0 = panic/crisis, 100 = calm/bullish)
    const vix = metricMap.get('GLOBAL_VIX')?.value ?? null;
    let globalRiskScore = 60;
    if (vix !== null && vix >= 25) globalRiskScore -= 35;
    else if (vix !== null && vix >= 20) globalRiskScore -= 15;
    else if (vix !== null && vix <= 14) globalRiskScore += 25;
    globalRiskScore = Math.max(0, Math.min(100, globalRiskScore));

    // 6. Sub-dimension 6: Foreign Net Flow (0 = heavy sell-off, 100 = aggressive inflow)
    const foreignFlow = metricMap.get('HOSE_FOREIGN_FLOW')?.value ?? null;
    let foreignFlowScore = 50;
    if (foreignFlow !== null && foreignFlow > 200) foreignFlowScore += 30;
    else if (foreignFlow !== null && foreignFlow < -500) foreignFlowScore -= 30;
    else if (foreignFlow !== null && foreignFlow < 0) foreignFlowScore -= 10;
    foreignFlowScore = Math.max(0, Math.min(100, foreignFlowScore));

    // Weighted Composite Score
    const compositeScore = Math.round(
      liquidityScore * 0.25 +
      ratesScore * 0.20 +
      fxScore * 0.20 +
      commoditiesScore * 0.15 +
      globalRiskScore * 0.10 +
      foreignFlowScore * 0.10
    );

    const subScores = {
      liquidity: liquidityScore,
      interestRates: ratesScore,
      fxPressure: fxScore,
      commodities: commoditiesScore,
      globalRisk: globalRiskScore,
      foreignFlow: foreignFlowScore,
    };
    const derivedFreshness = deriveMetricsFreshness(metrics);

    // Fail-closed gate: empty feed => UNKNOWN (scores below are neutral priors only).
    const hasAnyValue = metrics.some((m) => m.value !== null && Number.isFinite(m.value));
    if (!hasAnyValue) {
      return {
        regime: 'UNKNOWN',
        score: 50,
        confidence: 0,
        subScores,
        keyFactorsVi: ['Không có dữ liệu vĩ mô khả dụng — chưa thể xác định chu kỳ (fail-closed).'],
        rationaleVi: 'Thiếu dữ liệu đầu vào từ tất cả các kênh quan sát vĩ mô.',
        asOfDate,
        freshness: 'UNAVAILABLE',
      };
    }

    // Classify Regime
    let regime: MacroRegimeType = 'NEUTRAL';
    const keyFactors: string[] = [];

    if (vix !== null && vix >= 25) {
      regime = 'ELEVATED_RISK';
      keyFactors.push(`Chỉ số VIX tăng vọt lên mức ${vix.toFixed(1)}, tâm lý rủi ro toàn cầu ở mức cao.`);
    } else if (brent !== null && brent >= 88 && commoditiesScore < 40) {
      regime = 'INFLATIONARY';
      keyFactors.push(`Giá dầu Brent thế giới neo cao (${brent.toFixed(1)} USD/thùng), áp lực chi phí đẩy gia tăng.`);
    } else if (compositeScore >= 70) {
      regime = 'EXPANDING';
      keyFactors.push('Thanh khoản hệ thống dồi dào, lãi suất duy trì ở vùng thuận lợi cho tăng trưởng.');
    } else if (compositeScore <= 38) {
      regime = 'TIGHTENING';
      keyFactors.push('Áp lực thắt chặt tiền tệ, tỷ giá và lợi suất trái phiếu tăng gây áp lực chiết khấu định giá.');
    } else if (fxScore < 40 || ratesScore < 45) {
      regime = 'CAUTIOUS';
      keyFactors.push('Tỷ giá USD/VND và chênh lệch lãi suất quốc tế tạo áp lực thận trọng trong ngắn hạn.');
    } else if (liquidityScore >= 65 && ratesScore >= 60) {
      regime = 'ACCOMMODATIVE';
      keyFactors.push('Chính sách tiền tệ nới lỏng hỗ trợ mạnh mẽ dòng tiền trên thị trường tài chính.');
    } else {
      regime = 'NEUTRAL';
      keyFactors.push('Các chỉ báo kinh tế vĩ mô ở trạng thái cân bằng, chưa có cú sốc biến động lớn.');
    }

    if (dxy !== null && dxy >= 104) {
      keyFactors.push(`Chỉ số DXY đạt ${dxy.toFixed(1)} tạo áp lực lên khối ngoại và tỷ giá.`);
    }
    if (us10y !== null) {
      keyFactors.push(`Lợi suất TPCP Mỹ 10Y ở mức ${us10y.toFixed(2)}%.`);
    }

    const rationaleVi =
      regime === 'EXPANDING'
        ? 'Môi trường vĩ mô mở rộng tích cực: Thanh khoản dồi dào và lãi suất duy trì ở mức hấp dẫn kích thích dòng tiền đầu tư.'
        : regime === 'CAUTIOUS'
        ? 'Môi trường vĩ mô thận trọng: Biến động tỷ giá và chênh lệch lợi suất toàn cầu đòi hỏi chiến lược quản trị rủi ro chặt chẽ.'
        : regime === 'INFLATIONARY'
        ? 'Áp lực lạm phát chi phí đẩy: Hàng hóa năng lượng tăng giá tạo phân hóa mạnh giữa các nhóm ngành hưởng lợi và chịu chi phí.'
        : regime === 'ELEVATED_RISK'
        ? 'Tâm lý thị trường toàn cầu rủi ro cao: Ưu tiên bảo toàn vốn và quản trị tỷ trọng danh mục phòng thủ.'
        : regime === 'TIGHTENING'
        ? 'Chu kỳ thắt chặt tiền tệ: Định giá cổ phiếu chịu áp lực chiết khấu từ chi phí vốn gia tăng.'
        : 'Môi trường vĩ mô ổn định: Thị trường vận động theo các yếu tố nội tại của từng ngành và doanh nghiệp.';

    return {
      regime,
      score: compositeScore,
      confidence: Math.round(Math.min(100, Math.max(60, metrics.length * 8))),
      subScores,
      keyFactorsVi: keyFactors,
      rationaleVi,
      asOfDate,
      // Fail-closed (P27-D4-legacy): freshness derives from inputs, never hardcoded.
      freshness: derivedFreshness,
    };
  }
}

/**
 * Derives aggregate freshness across input metrics (P27-D4-legacy):
 * empty => UNAVAILABLE, any INVALID => INVALID, all CURRENT => CURRENT,
 * otherwise STALE. STALE is never masked by CURRENT.
 */
function deriveMetricsFreshness(metrics: readonly { freshness: DataFreshnessStatus }[]): DataFreshnessStatus {
  if (metrics.length === 0) return 'UNAVAILABLE';
  if (metrics.some((m) => m.freshness === 'INVALID')) return 'INVALID';
  if (metrics.every((m) => m.freshness === 'CURRENT')) return 'CURRENT';
  if (metrics.some((m) => m.freshness === 'CURRENT' || m.freshness === 'STALE')) return 'STALE';
  return 'UNAVAILABLE';
}
