/**
 * RISK REWARD ENGINE
 * Deterministic calculation of risk-reward ratio, stop-loss distance,
 * target upside, and position sizing recommendations.
 */

export interface RiskRewardCalculationInput {
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  capitalVnd?: number;
  maxRiskPerTradePercent?: number; // e.g., 2%
}

export interface RiskRewardResult {
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  riskAmount: number;
  rewardAmount: number;
  riskPercent: number;
  rewardPercent: number;
  ratio: number;
  ratioLabel: string;
  isFavorable: boolean;
  suggestedShares: number;
  riskCapitalVnd: number;
}

export class RiskRewardEngine {
  /**
   * Calculates comprehensive risk/reward metrics and position sizing
   */
  static calculate(input: RiskRewardCalculationInput): RiskRewardResult {
    const {
      entryPrice,
      stopLossPrice,
      targetPrice,
      capitalVnd = 100_000_000,
      maxRiskPerTradePercent = 2,
    } = input;

    if (entryPrice <= 0 || stopLossPrice <= 0 || targetPrice <= 0) {
      throw new Error('Prices must be positive numbers');
    }

    const riskAmount = Math.max(0, entryPrice - stopLossPrice);
    const rewardAmount = Math.max(0, targetPrice - entryPrice);

    const riskPercent = Number((((entryPrice - stopLossPrice) / entryPrice) * 100).toFixed(2));
    const rewardPercent = Number((((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2));

    const ratio = riskAmount > 0 ? Number((rewardAmount / riskAmount).toFixed(2)) : 0;
    const ratioLabel = riskAmount > 0 ? `1 : ${ratio}` : 'N/A';
    const isFavorable = ratio >= 2.0;

    const maxRiskCapital = (capitalVnd * maxRiskPerTradePercent) / 100;
    const suggestedShares =
      riskAmount > 0 ? Math.floor(maxRiskCapital / riskAmount / 100) * 100 : 0; // Rounded to standard lot of 100 shares

    return {
      entryPrice,
      stopLossPrice,
      targetPrice,
      riskAmount,
      rewardAmount,
      riskPercent,
      rewardPercent,
      ratio,
      ratioLabel,
      isFavorable,
      suggestedShares,
      riskCapitalVnd: maxRiskCapital,
    };
  }
}
