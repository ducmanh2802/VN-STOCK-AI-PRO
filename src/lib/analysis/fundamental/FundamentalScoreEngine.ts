import {
  calculateRevenueGrowth,
  calculateProfitGrowth,
  calculateEPS,
  calculatePE,
  calculatePB,
  calculateROE,
  calculateROA,
  calculateDebtToEquity,
  calculateCurrentRatio,
  calculateDividendYield,
  calculateOperatingMargin,
  calculateNetMargin,
  calculateFreeCashFlow,
} from './metrics.ts';

export interface FundamentalDataInput {
  price?: number | null;
  currentRevenue?: number | null;
  previousRevenue?: number | null;
  currentProfit?: number | null;
  previousProfit?: number | null;
  operatingProfit?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  totalEquity?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  operatingCashFlow?: number | null;
  capitalExpenditure?: number | null;
  outstandingShares?: number | null;
  dividendPerShare?: number | null;
  bookValuePerShare?: number | null;
}

export interface FundamentalScoreBreakdown {
  growth: number | null;           // 0-100
  profitability: number | null;    // 0-100
  financialHealth: number | null;  // 0-100
  cashFlow: number | null;         // 0-100
  valuationQuality: number | null; // 0-100
}

export interface ComputedFundamentalMetrics {
  revenueGrowth: number | null;
  profitGrowth: number | null;
  eps: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  dividendYield: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  freeCashFlow: number | null;
}

export interface FundamentalScoreResult {
  score: number | null; // Overall composite score 0-100, or null if insufficient data
  breakdown: FundamentalScoreBreakdown;
  metrics: ComputedFundamentalMetrics;
  missingDataExplanations: Record<string, string>;
  reasons: string[];
  warnings: string[];
}

export class FundamentalScoreEngine {
  /**
   * Deterministically evaluates fundamental strength across 5 core categories:
   * 1. Growth (25%)
   * 2. Profitability (25%)
   * 3. Financial Health (20%)
   * 4. Cash Flow (15%)
   * 5. Valuation Quality (15%)
   */
  static evaluate(input: FundamentalDataInput): FundamentalScoreResult {
    const missingDataExplanations: Record<string, string> = {};
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Calculate all 13 required metrics
    const revGrowthRes = calculateRevenueGrowth(input.currentRevenue, input.previousRevenue);
    if (revGrowthRes.value === null && revGrowthRes.explanation) {
      missingDataExplanations.revenueGrowth = revGrowthRes.explanation;
    }

    const profitGrowthRes = calculateProfitGrowth(input.currentProfit, input.previousProfit);
    if (profitGrowthRes.value === null && profitGrowthRes.explanation) {
      missingDataExplanations.profitGrowth = profitGrowthRes.explanation;
    }

    const epsRes = calculateEPS(input.currentProfit, input.outstandingShares);
    if (epsRes.value === null && epsRes.explanation) {
      missingDataExplanations.eps = epsRes.explanation;
    }

    const peRes = calculatePE(input.price, epsRes.value);
    if (peRes.value === null && peRes.explanation) {
      missingDataExplanations.pe = peRes.explanation;
    }

    const computedBvps = input.bookValuePerShare ?? (
      input.totalEquity && input.outstandingShares && input.outstandingShares > 0
        ? input.totalEquity / input.outstandingShares
        : null
    );
    const pbRes = calculatePB(input.price, computedBvps);
    if (pbRes.value === null && pbRes.explanation) {
      missingDataExplanations.pb = pbRes.explanation;
    }

    const roeRes = calculateROE(input.currentProfit, input.totalEquity);
    if (roeRes.value === null && roeRes.explanation) {
      missingDataExplanations.roe = roeRes.explanation;
    }

    const roaRes = calculateROA(input.currentProfit, input.totalAssets);
    if (roaRes.value === null && roaRes.explanation) {
      missingDataExplanations.roa = roaRes.explanation;
    }

    const deRes = calculateDebtToEquity(input.totalLiabilities, input.totalEquity);
    if (deRes.value === null && deRes.explanation) {
      missingDataExplanations.debtToEquity = deRes.explanation;
    }

    const crRes = calculateCurrentRatio(input.currentAssets, input.currentLiabilities);
    if (crRes.value === null && crRes.explanation) {
      missingDataExplanations.currentRatio = crRes.explanation;
    }

    const dyRes = calculateDividendYield(input.dividendPerShare, input.price);
    if (dyRes.value === null && dyRes.explanation) {
      missingDataExplanations.dividendYield = dyRes.explanation;
    }

    const opMarginRes = calculateOperatingMargin(input.operatingProfit, input.currentRevenue);
    if (opMarginRes.value === null && opMarginRes.explanation) {
      missingDataExplanations.operatingMargin = opMarginRes.explanation;
    }

    const netMarginRes = calculateNetMargin(input.currentProfit, input.currentRevenue);
    if (netMarginRes.value === null && netMarginRes.explanation) {
      missingDataExplanations.netMargin = netMarginRes.explanation;
    }

    const fcfRes = calculateFreeCashFlow(input.operatingCashFlow, input.capitalExpenditure);
    if (fcfRes.value === null && fcfRes.explanation) {
      missingDataExplanations.freeCashFlow = fcfRes.explanation;
    }

    const metrics: ComputedFundamentalMetrics = {
      revenueGrowth: revGrowthRes.value,
      profitGrowth: profitGrowthRes.value,
      eps: epsRes.value,
      pe: peRes.value,
      pb: pbRes.value,
      roe: roeRes.value,
      roa: roaRes.value,
      debtToEquity: deRes.value,
      currentRatio: crRes.value,
      dividendYield: dyRes.value,
      operatingMargin: opMarginRes.value,
      netMargin: netMarginRes.value,
      freeCashFlow: fcfRes.value,
    };

    // 1. CATEGORY: GROWTH (Revenue Growth & Profit Growth)
    let growthScore: number | null = null;
    const growthComponents: number[] = [];

    if (metrics.revenueGrowth !== null) {
      // Benchmark: >25% => 100, 15-25% => 80, 5-15% => 60, 0-5% => 45, <0% => 20
      let sub = 50;
      if (metrics.revenueGrowth >= 25) sub = 95;
      else if (metrics.revenueGrowth >= 15) sub = 80;
      else if (metrics.revenueGrowth >= 5) sub = 65;
      else if (metrics.revenueGrowth >= 0) sub = 45;
      else sub = Math.max(10, 40 + metrics.revenueGrowth);
      growthComponents.push(sub);
      reasons.push(`Tăng trưởng doanh thu đạt ${metrics.revenueGrowth.toFixed(1)}%.`);
    }

    if (metrics.profitGrowth !== null) {
      let sub = 50;
      if (metrics.profitGrowth >= 30) sub = 100;
      else if (metrics.profitGrowth >= 15) sub = 85;
      else if (metrics.profitGrowth >= 5) sub = 65;
      else if (metrics.profitGrowth >= 0) sub = 45;
      else sub = Math.max(0, 40 + metrics.profitGrowth * 0.5);
      growthComponents.push(sub);
      reasons.push(`Tăng trưởng lợi nhuận đạt ${metrics.profitGrowth.toFixed(1)}%.`);
    }

    if (growthComponents.length > 0) {
      growthScore = Number(
        (growthComponents.reduce((a, b) => a + b, 0) / growthComponents.length).toFixed(1)
      );
    } else {
      warnings.push('Không đủ dữ liệu để đánh giá điểm Tăng trưởng (Growth).');
    }

    // 2. CATEGORY: PROFITABILITY (ROE, ROA, Operating Margin, Net Margin)
    let profitabilityScore: number | null = null;
    const profComponents: number[] = [];

    if (metrics.roe !== null) {
      // ROE: >25% => 100, 18-25% => 85, 12-18% => 70, 7-12% => 50, <7% => 25
      let sub = 50;
      if (metrics.roe >= 25) sub = 95;
      else if (metrics.roe >= 18) sub = 85;
      else if (metrics.roe >= 12) sub = 70;
      else if (metrics.roe >= 6) sub = 50;
      else sub = 25;
      profComponents.push(sub);
      reasons.push(`Tỷ suất sinh lời trên vốn chủ (ROE) đạt ${metrics.roe.toFixed(1)}%.`);
    }

    if (metrics.netMargin !== null) {
      let sub = 50;
      if (metrics.netMargin >= 20) sub = 95;
      else if (metrics.netMargin >= 12) sub = 80;
      else if (metrics.netMargin >= 6) sub = 65;
      else if (metrics.netMargin >= 0) sub = 40;
      else sub = 15;
      profComponents.push(sub);
      reasons.push(`Biên lợi nhuận ròng đạt ${metrics.netMargin.toFixed(1)}%.`);
    }

    if (metrics.roa !== null) {
      let sub = 50;
      if (metrics.roa >= 12) sub = 95;
      else if (metrics.roa >= 7) sub = 75;
      else if (metrics.roa >= 3) sub = 55;
      else sub = 30;
      profComponents.push(sub);
    }

    if (profComponents.length > 0) {
      profitabilityScore = Number(
        (profComponents.reduce((a, b) => a + b, 0) / profComponents.length).toFixed(1)
      );
    } else {
      warnings.push('Không đủ dữ liệu để đánh giá Hiệu quả hoạt động (Profitability).');
    }

    // 3. CATEGORY: FINANCIAL HEALTH (Debt/Equity, Current Ratio)
    let healthScore: number | null = null;
    const healthComponents: number[] = [];

    if (metrics.debtToEquity !== null) {
      let sub = 50;
      if (metrics.debtToEquity <= 0.5) sub = 95;
      else if (metrics.debtToEquity <= 1.0) sub = 80;
      else if (metrics.debtToEquity <= 1.8) sub = 60;
      else if (metrics.debtToEquity <= 3.0) sub = 40;
      else sub = 20;
      healthComponents.push(sub);
      reasons.push(`Tỷ lệ Nợ/Vốn chủ sở hữu (D/E) ở mức an toàn: ${metrics.debtToEquity.toFixed(2)}x.`);
    }

    if (metrics.currentRatio !== null) {
      let sub = 50;
      if (metrics.currentRatio >= 2.0) sub = 95;
      else if (metrics.currentRatio >= 1.5) sub = 80;
      else if (metrics.currentRatio >= 1.0) sub = 60;
      else sub = 30;
      healthComponents.push(sub);
      reasons.push(`Hệ số thanh toán hiện hành đạt ${metrics.currentRatio.toFixed(2)}x.`);
    }

    if (healthComponents.length > 0) {
      healthScore = Number(
        (healthComponents.reduce((a, b) => a + b, 0) / healthComponents.length).toFixed(1)
      );
    } else {
      warnings.push('Không đủ dữ liệu để đánh giá Sức khỏe tài chính (Financial Health).');
    }

    // 4. CATEGORY: CASH FLOW (Free Cash Flow)
    let cashFlowScore: number | null = null;
    if (metrics.freeCashFlow !== null) {
      if (metrics.freeCashFlow > 0) {
        cashFlowScore = 85;
        reasons.push('Dòng tiền tự do (FCF) dương, củng cố nội lực tài chính.');
      } else {
        cashFlowScore = 40;
        reasons.push('Dòng tiền tự do (FCF) âm do thâm hụt hoạt động hoặc mở rộng đầu tư lớn.');
      }
    } else {
      warnings.push('Không có dữ liệu Dòng tiền tự do (Cash Flow).');
    }

    // 5. CATEGORY: VALUATION QUALITY (P/E, P/B, Dividend Yield)
    let valQualityScore: number | null = null;
    const valComponents: number[] = [];

    if (metrics.pe !== null) {
      let sub = 50;
      if (metrics.pe > 0 && metrics.pe <= 10) sub = 90;
      else if (metrics.pe <= 16) sub = 75;
      else if (metrics.pe <= 25) sub = 55;
      else if (metrics.pe <= 40) sub = 35;
      else sub = 20;
      valComponents.push(sub);
      reasons.push(`Định giá P/E hiện tại là ${metrics.pe.toFixed(1)}x.`);
    }

    if (metrics.pb !== null) {
      let sub = 50;
      if (metrics.pb > 0 && metrics.pb <= 1.2) sub = 90;
      else if (metrics.pb <= 2.2) sub = 70;
      else if (metrics.pb <= 3.5) sub = 50;
      else sub = 30;
      valComponents.push(sub);
    }

    if (metrics.dividendYield !== null && metrics.dividendYield > 0) {
      let sub = 50;
      if (metrics.dividendYield >= 7) sub = 95;
      else if (metrics.dividendYield >= 4) sub = 80;
      else sub = 60;
      valComponents.push(sub);
      reasons.push(`Tỷ suất cổ tức tiền mặt đạt ${metrics.dividendYield.toFixed(1)}%/năm.`);
    }

    if (valComponents.length > 0) {
      valQualityScore = Number(
        (valComponents.reduce((a, b) => a + b, 0) / valComponents.length).toFixed(1)
      );
    } else {
      warnings.push('Chưa đủ dữ liệu để tính Chất lượng định giá.');
    }

    // Calculate overall composite score only if at least 2 categories exist
    const categoryWeights = [
      { score: growthScore, weight: 0.25 },
      { score: profitabilityScore, weight: 0.25 },
      { score: healthScore, weight: 0.20 },
      { score: cashFlowScore, weight: 0.15 },
      { score: valQualityScore, weight: 0.15 },
    ];

    const available = categoryWeights.filter((c) => c.score !== null) as { score: number; weight: number }[];

    let overallScore: number | null = null;
    if (available.length >= 2) {
      const totalWeight = available.reduce((acc, c) => acc + c.weight, 0);
      const weightedSum = available.reduce((acc, c) => acc + c.score * c.weight, 0);
      overallScore = Number((weightedSum / totalWeight).toFixed(1));
    } else {
      warnings.push('Dữ liệu tài chính không đủ (dưới 2 danh mục cốt lõi) để kết luận điểm tổng thể.');
    }

    return {
      score: overallScore,
      breakdown: {
        growth: growthScore,
        profitability: profitabilityScore,
        financialHealth: healthScore,
        cashFlow: cashFlowScore,
        valuationQuality: valQualityScore,
      },
      metrics,
      missingDataExplanations,
      reasons,
      warnings,
    };
  }
}
