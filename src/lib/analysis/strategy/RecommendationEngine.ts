/**
 * PHASE 17 — AI INVESTMENT RECOMMENDATION ENGINE
 * ===============================================
 * Orchestrates multi-horizon investment recommendations by combining:
 *   1. StrategyScorer (Phase 17.3)
 *   2. SignalEngine (Phase 17.4)
 *   3. RiskRewardEngine (Phase 17.5)
 *   4. Deterministic thesis, catalysts, warnings, and evidence traceability.
 */

import {
  InvestmentHorizon,
  InvestmentRecommendation,
  RecommendationRanking,
  RankingRequest,
  RankingResult,
  AnalysisEvidence,
  HORIZON_HOLDING_DAYS,
} from '../../../types/recommendation';
import { ConfidenceLevel } from '../../../types/enterpriseIntelligence';
import { StrategyScorer, StrategyScoringInput } from './StrategyScorer';
import { SignalEngine } from './SignalEngine';
import { RiskRewardEngine } from './RiskRewardEngine';

export interface RecommendationGenerateParams {
  symbol: string;
  strategy: InvestmentHorizon;
  currentPrice: number;
  scores: StrategyScoringInput;
  supportPrice?: number | null;
  resistancePrice?: number | null;
  fairValuePrice?: number | null;
  historicalVolatility?: number | null; // e.g. 0.02
  peRatio?: number | null;
  pbRatio?: number | null;
  roe?: number | null;
  revenueGrowth?: number | null;
  profitGrowth?: number | null;
  rsi?: number | null;
  customConfidence?: ConfidenceLevel;
}

export class RecommendationEngine {
  /**
   * Generates a single recommendation for a specific investment horizon.
   */
  static generate(params: RecommendationGenerateParams): InvestmentRecommendation {
    const {
      symbol,
      strategy,
      currentPrice,
      scores,
      supportPrice,
      resistancePrice,
      fairValuePrice,
      peRatio,
      pbRatio,
      roe,
      rsi,
      customConfidence,
    } = params;

    const cleanSymbol = symbol.toUpperCase().trim();

    // 1. Calculate Score Breakdown & Composite Score
    const scoreResult = StrategyScorer.score(scores, strategy);
    const score = scoreResult.score;

    // 2. Derive Signal (BUY / HOLD / SELL)
    const signalResult = SignalEngine.generate({
      strategy,
      score,
    });

    // 3. Calculate Targets, Stop Loss, and Risk/Reward
    let targetPrice: number;
    let stopLossPrice: number;

    const holdingDays = HORIZON_HOLDING_DAYS[strategy];
    const avgHoldingDays = Math.round((holdingDays.min + holdingDays.max) / 2);

    if (strategy === 'SHORT_TERM') {
      // Short term: technical levels or dynamic %
      targetPrice = resistancePrice && resistancePrice > currentPrice
        ? resistancePrice
        : Math.round(currentPrice * 1.08);
      stopLossPrice = supportPrice && supportPrice < currentPrice
        ? supportPrice
        : Math.round(currentPrice * 0.95);
    } else if (strategy === 'MEDIUM_TERM') {
      // Medium term: blend of fair value and technical expansion
      const fv = fairValuePrice && fairValuePrice > currentPrice ? fairValuePrice : currentPrice * 1.18;
      targetPrice = Math.round(fv);
      stopLossPrice = supportPrice && supportPrice < currentPrice
        ? Math.round(supportPrice * 0.97)
        : Math.round(currentPrice * 0.92);
    } else {
      // Long term: fundamental fair value compound
      const fv = fairValuePrice && fairValuePrice > currentPrice ? fairValuePrice : currentPrice * 1.30;
      targetPrice = Math.round(fv);
      stopLossPrice = Math.round(currentPrice * 0.88);
    }

    const rrResult = RiskRewardEngine.calculate({
      entryPrice: currentPrice,
      stopLossPrice,
      targetPrice,
    });

    const potentialUpside = rrResult.rewardPercent;
    const potentialDownside = rrResult.riskPercent;
    const riskAmount = rrResult.riskAmount;
    const rewardAmount = rrResult.rewardAmount;
    const riskReward = rrResult.ratio;

    // Expected return: adjusted by win-rate probability derived from score
    const estimatedWinRate = score !== null ? Math.min(0.85, Math.max(0.35, score / 100)) : 0.5;
    const expectedReturn = Number(
      ((estimatedWinRate * potentialUpside - (1 - estimatedWinRate) * potentialDownside)).toFixed(2)
    );

    // 4. Determine Confidence Level
    let confidence: ConfidenceLevel = 'MEDIUM';
    if (customConfidence) {
      confidence = customConfidence;
    } else if (scoreResult.availableComponents >= 5 && score !== null) {
      confidence = 'HIGH';
    } else if (scoreResult.availableComponents <= 2) {
      confidence = 'LOW';
    }

    // 5. Generate Dynamic Reasons & Warnings
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (score !== null && score >= 65) {
      reasons.push(`Điểm tổng hợp chiến lược đạt ${score}/100, phản ánh xung lực tăng giá tích cực.`);
    }
    if (scores.technicalScore !== null && scores.technicalScore >= 60) {
      reasons.push(`Chỉ báo kỹ thuật thuận lợi, giá vận động trên các đường trung bình MA then chốt.`);
    }
    if (scores.fundamentalScore !== null && scores.fundamentalScore >= 60) {
      reasons.push(`Nền tảng tài chính lành mạnh với ROE đạt ${roe ? roe.toFixed(1) + '%' : 'mức cao'}.`);
    }
    if (scores.moneyFlowScore !== null && scores.moneyFlowScore >= 60) {
      reasons.push(`Dòng tiền tổ chức và khối ngoại ghi nhận xu hướng mua ròng chủ động.`);
    }
    if (scores.valuationScore !== null && scores.valuationScore >= 60) {
      reasons.push(`Định giá hấp dẫn với biên an toàn ước tính ${potentialUpside.toFixed(1)}%.`);
    }

    if (reasons.length === 0) {
      reasons.push(`Vị thế đang trong giai đoạn tích lũy chờ xác nhận xu hướng tiếp theo.`);
    }

    if (scores.riskScore !== null && scores.riskScore >= 60) {
      warnings.push(`Chỉ số rủi ro biến động ở mức ${scores.riskScore}/100, cần thận trọng phân bổ tỷ trọng.`);
    }
    if (potentialDownside > 8) {
      warnings.push(`Biên độ cắt lỗ ${potentialDownside.toFixed(1)}% tương đối rộng, nên tuân thủ kỷ luật dừng lỗ.`);
    }
    if (rsi !== null && rsi !== undefined && rsi > 70) {
      warnings.push(`RSI(14) đạt ${rsi} (tiệm cận vùng quá mua), hạn chế mua đuổi tại các phiên hưng phấn.`);
    }
    if (warnings.length === 0) {
      warnings.push(`Luôn quản trị rủi ro và giải ngân từng phần theo kế hoạch vốn.`);
    }

    // 6. Evidence Traceability Matrix
    const evidence: AnalysisEvidence[] = [];

    if (scores.technicalScore !== null) {
      evidence.push({
        metric: 'Technical Strategy Score',
        value: scores.technicalScore,
        period: 'Realtime',
        source: 'TechnicalAnalysisEngine',
        calculation: 'MA, RSI, MACD, Trend persistence',
        confidence: 'HIGH',
      });
    }
    if (scores.fundamentalScore !== null) {
      evidence.push({
        metric: 'Fundamental Quality Score',
        value: scores.fundamentalScore,
        period: 'TTM / Latest Quarter',
        source: 'VPS Financial Statements',
        calculation: 'Piotroski F-score, DuPont, Health & Margin ratios',
        confidence: 'HIGH',
      });
    }
    if (scores.valuationScore !== null) {
      evidence.push({
        metric: 'Valuation Attractiveness',
        value: scores.valuationScore,
        period: 'Current',
        source: 'ValuationEngine',
        calculation: `P/E: ${peRatio ?? 'N/A'}, P/B: ${pbRatio ?? 'N/A'}, DCF & Multiple models`,
        confidence: 'HIGH',
      });
    }
    if (scores.moneyFlowScore !== null) {
      evidence.push({
        metric: 'Institutional Money Flow',
        value: scores.moneyFlowScore,
        period: 'Intraday / 20D',
        source: 'VPS Order Flow',
        calculation: 'Net foreign buy/sell + Active matching volume pressure',
        confidence: 'HIGH',
      });
    }

    return {
      symbol: cleanSymbol,
      strategy,
      signal: signalResult.signal,
      score,
      confidence,
      entryPrice: currentPrice,
      targetPrice,
      stopLoss: stopLossPrice,
      riskReward,
      potentialUpside,
      potentialDownside,
      riskAmount,
      rewardAmount,
      expectedReturn,
      holdingPeriod: avgHoldingDays,
      reasons,
      warnings,
      scoreBreakdown: scoreResult.breakdown,
      evidence,
      generatedAt: new Date().toISOString(),
      asOfDate: new Date().toISOString().split('T')[0],
      currency: 'VND',
    };
  }

  /**
   * Generates recommendations for all 3 horizons (SHORT_TERM, MEDIUM_TERM, LONG_TERM).
   */
  static generateMultiHorizon(
    params: Omit<RecommendationGenerateParams, 'strategy'>
  ): Record<InvestmentHorizon, InvestmentRecommendation> {
    return {
      SHORT_TERM: this.generate({ ...params, strategy: 'SHORT_TERM' }),
      MEDIUM_TERM: this.generate({ ...params, strategy: 'MEDIUM_TERM' }),
      LONG_TERM: this.generate({ ...params, strategy: 'LONG_TERM' }),
    };
  }

  /**
   * Ranks a universe of stocks according to a strategy.
   */
  static rankUniverse(
    request: RankingRequest,
    universeData: Map<string, Omit<RecommendationGenerateParams, 'strategy' | 'symbol'>>
  ): RankingResult {
    const { strategy, symbols, minScore = 0, minConfidence, signalFilter } = request;

    const recommendations: InvestmentRecommendation[] = [];

    for (const sym of symbols) {
      const data = universeData.get(sym.toUpperCase());
      if (data) {
        const rec = this.generate({
          ...data,
          symbol: sym,
          strategy,
        });
        recommendations.push(rec);
      }
    }

    // Filter
    let filtered = recommendations.filter((r) => (r.score ?? 0) >= minScore);

    if (minConfidence) {
      const confOrder: Record<ConfidenceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const reqVal = confOrder[minConfidence];
      filtered = filtered.filter((r) => confOrder[r.confidence] >= reqVal);
    }

    if (signalFilter && signalFilter.length > 0) {
      const allowed = new Set(signalFilter);
      filtered = filtered.filter((r) => allowed.has(r.signal));
    }

    // Sort descending by score then expected return
    filtered.sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.expectedReturn ?? 0) - (a.expectedReturn ?? 0);
    });

    const rankings: RecommendationRanking[] = filtered.map((r, idx) => ({
      strategy,
      rank: idx + 1,
      symbol: r.symbol,
      score: r.score,
      signal: r.signal,
      confidence: r.confidence,
      expectedReturn: r.expectedReturn,
      riskReward: r.riskReward,
    }));

    return {
      strategy,
      generatedAt: new Date().toISOString(),
      rankings,
      universeSize: symbols.length,
      filteredCount: rankings.length,
    };
  }
}
