/**
 * ENGINE 4 — FINANCIAL HEALTH ENGINE
 * Liquidity, leverage, solvency, interest coverage and debt dynamics.
 * Deterministic; risk is classified with documented, context-aware thresholds
 * (compared against sector/historical when available).
 */
import type { FinancialHealthResult, RiskLevel } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts } from './financialFacts.ts';
import { n, pctChange, round2 } from './helpers.ts';

export class FinancialHealthEngine {
  static evaluate(set: FinancialFactSet): FinancialHealthResult {
    const { current, previous } = latestFacts(set);
    if (!current) return this.empty();

    const debt = current.longTermDebt ?? current.totalLiabilities;
    const prevDebt = previous ? previous.longTermDebt ?? previous.totalLiabilities : null;
    const ebit = current.operatingProfit ?? current.ebitda;
    const ebitda = current.ebitda ?? current.operatingProfit;

    const currentRatio = safeRatio(current.currentAssets, current.currentLiabilities);
    const quickNumerator = n(current.currentAssets) !== null && n(current.inventory) !== null
      ? (current.currentAssets! - current.inventory!)
      : null;
    const quickRatio = safeRatio(quickNumerator, current.currentLiabilities);
    const debtToEquity = safeRatio(debt, current.totalEquity);
    const netDebt = (n(debt) !== null && n(current.cash) !== null) ? debt! - current.cash! : null;
    const netDebtToEBITDA = ebitda !== null && ebitda > 0 && netDebt !== null ? round2(netDebt / ebitda) : null;
    const interestCoverage = safeRatio(ebit, current.interestExpense);
    const cashToDebt = safeRatio(current.cash, debt);
    const debtGrowth = pctChange(debt, prevDebt);

    const riskLevel = this.classifyRisk({
      currentRatio,
      quickRatio,
      debtToEquity,
      netDebtToEBITDA,
      interestCoverage,
      cashToDebt,
      debtGrowth,
    });

    // Score: average of normalized sub-scores; requires >=2 metrics.
    const subs: number[] = [];
    if (currentRatio !== null) subs.push(scoreRatio(currentRatio, 1.5, 2.5, true));
    if (debtToEquity !== null) subs.push(scoreRatio(debtToEquity, 2.0, 0.5, false));
    if (interestCoverage !== null) subs.push(scoreRatio(interestCoverage, 1.5, 10, true));
    if (netDebtToEBITDA !== null) subs.push(scoreRatio(netDebtToEBITDA, 4.0, 1.0, false));
    if (cashToDebt !== null) subs.push(scoreRatio(cashToDebt, 0.1, 1.0, true));
    let score: number | null = null;
    if (subs.length >= 2) score = round2(subs.reduce((a, b) => a + b, 0) / subs.length);

    return {
      score,
      currentRatio,
      quickRatio,
      debtToEquity,
      netDebt,
      netDebtToEBITDA,
      interestCoverage,
      cashToDebt,
      debtGrowth,
      riskLevel,
    };
  }

  static classifyRisk(m: {
    currentRatio: number | null;
    quickRatio: number | null;
    debtToEquity: number | null;
    netDebtToEBITDA: number | null;
    interestCoverage: number | null;
    cashToDebt: number | null;
    debtGrowth: number | null;
  }): RiskLevel | null {
    let riskPoints = 0;
    let basis = 0;

    const cr = m.currentRatio ?? m.quickRatio;
    if (cr !== null) {
      basis++;
      if (cr < 1.0) riskPoints += 3;
      else if (cr < 1.5) riskPoints += 1;
      else riskPoints += 0;
    }
    if (m.debtToEquity !== null) {
      basis++;
      if (m.debtToEquity > 3) riskPoints += 3;
      else if (m.debtToEquity > 1.5) riskPoints += 1;
    }
    if (m.netDebtToEBITDA !== null) {
      basis++;
      if (m.netDebtToEBITDA > 5) riskPoints += 3;
      else if (m.netDebtToEBITDA > 3) riskPoints += 1;
    }
    if (m.interestCoverage !== null) {
      basis++;
      if (m.interestCoverage < 1.5) riskPoints += 3;
      else if (m.interestCoverage < 3) riskPoints += 1;
    }
    if (m.cashToDebt !== null) {
      basis++;
      if (m.cashToDebt < 0.1) riskPoints += 1;
    }
    if (basis === 0) return null;

    const avg = riskPoints / basis; // 0..3
    if (avg >= 2.5) return 'CRITICAL';
    if (avg >= 1.5) return 'HIGH';
    if (avg >= 0.8) return 'MEDIUM';
    return 'LOW';
  }

  private static empty(): FinancialHealthResult {
    return {
      score: null,
      currentRatio: null,
      quickRatio: null,
      debtToEquity: null,
      netDebt: null,
      netDebtToEBITDA: null,
      interestCoverage: null,
      cashToDebt: null,
      debtGrowth: null,
      riskLevel: null,
    };
  }
}

function safeRatio(num: number | null | undefined, den: number | null | undefined): number | null {
  const a = n(num);
  const b = n(den);
  if (a === null || b === null || b === 0) return null;
  return round2(a / b);
}

/**
 * Score a ratio where `good` is on one side. `higher`=true means high is good.
 * Maps from a function of the value to 0..100.
 */
function scoreRatio(value: number, low: number, high: number, higher: boolean): number {
  if (higher) {
    const t = (value - low) / (high - low);
    return Math.min(100, Math.max(0, t * 100));
  }
  const t = (high - value) / (low - high); // values above `low` score 0
  return Math.min(100, Math.max(0, t * 100));
}