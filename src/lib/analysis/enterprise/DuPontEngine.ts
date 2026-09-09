/**
 * ENGINE 6A — DUPONT ENGINE
 * Decomposes ROE into 3-factor and 5-factor multiplicative components and
 * identifies the primary ROE driver (margin / asset efficiency / leverage).
 * Deterministic; missing factors are `null`, never forced.
 */
import type { DupontResult } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts } from './financialFacts.ts';
import { n, round2 } from './helpers.ts';

export interface DupontOptions {
  effectiveTaxRate?: number | null; // decimal
}

function avgTwo(a: number | null | undefined, b: number | null | undefined): number | null {
  const x = n(a);
  const y = n(b);
  if (x === null && y === null) return null;
  if (x !== null && y !== null) return (x + y) / 2;
  return x ?? y;
}

export class DuPontEngine {
  static evaluate(set: FinancialFactSet, options?: DupontOptions): DupontResult {
    const { current, previous } = latestFacts(set);
    if (!current) return DuPontEngine.empty();

    const revenue = n(current.revenue);
    const netIncome = n(current.netProfit);
    const avgAssets = avgTwo(current.totalAssets, previous?.totalAssets);
    const avgEquity = avgTwo(current.totalEquity, previous?.totalEquity);

    // ---- 3-factor DuPont ----
    const netProfitMargin = revenue === null || revenue === 0 || netIncome === null ? null : round2(netIncome / revenue);
    const assetTurnover = avgAssets === null || avgAssets === 0 || revenue === null ? null : round2(revenue / avgAssets);
    const equityMultiplier = avgAssets === null || avgEquity === null || avgEquity === 0 ? null : round2(avgAssets / avgEquity);

    let calculatedROE: number | null = null;
    if (netProfitMargin !== null && assetTurnover !== null && equityMultiplier !== null) {
      calculatedROE = round2(netProfitMargin * assetTurnover * equityMultiplier * 100);
    }
    const reportedROE = avgEquity === null || avgEquity === 0 || netIncome === null ? null : round2((netIncome / avgEquity) * 100);
    const reconciliationDifference =
      calculatedROE !== null && reportedROE !== null ? round2(calculatedROE - reportedROE) : null;

    // ---- 5-factor DuPont ----
    const ebit = current.operatingProfit ?? current.ebitda;
    let taxBurden: number | null = null;
    let interestBurden: number | null = null;
    const operatingMargin = ebit === null || revenue === null || revenue === 0 ? null : round2(ebit / revenue);
    const assetTurnover5 = assetTurnover;
    const financialLeverage = equityMultiplier;

    const taxRate = options?.effectiveTaxRate;
    if (taxRate !== null && taxRate !== undefined && netIncome !== null && revenue !== null) {
      // pretaxIncome = EBIT - interest; approximate with netIncome/(1-tax) when no interest data.
      if (ebit !== null) {
        const pretaxApprox = ebit - (netIncome / (1 - Math.max(0, Math.min(0.5, taxRate))) - (ebit - netIncome));
        const pretax = n(pretaxApprox);
        if (pretax !== null && pretax !== 0) {
          taxBurden = round2(netIncome / pretax);
        }
      }
    }
    let calcROE5: number | null = null;
    const factors5: Array<number | null> = [taxBurden, interestBurden, operatingMargin, assetTurnover5, financialLeverage];
    if (factors5.every((x) => x !== null)) {
      calcROE5 = round2((factors5 as number[]).reduce((a, b) => a * b, 1) * 100);
    }

    const primaryROEDriver = this.identifyDriver(netProfitMargin, assetTurnover, equityMultiplier, calculatedROE);

    return {
      threeFactor: {
        netProfitMargin,
        assetTurnover,
        equityMultiplier,
        calculatedROE,
        reportedROE,
        reconciliationDifference,
      },
      fiveFactor: {
        taxBurden,
        interestBurden,
        operatingMargin,
        assetTurnover: assetTurnover5,
        financialLeverage,
        calculatedROE: calcROE5,
      },
      primaryROEDriver,
    };
  }

  static identifyDriver(
    npm: number | null,
    at: number | null,
    em: number | null,
    roe: number | null
  ): DupontResult['primaryROEDriver'] {
    if (npm === null || at === null || em === null || roe === null) return null;
    // Deviation of each factor from a "neutral" benchmark (in log terms).
    const benchNpm = 0.10;
    const benchAt = 1.0;
    const benchEm = 1.0;
    const marginDev = Math.abs(Math.log(Math.max(npm, 1e-6) / benchNpm));
    const assetDev = Math.abs(Math.log(Math.max(at, 1e-6) / benchAt));
    const levDev = Math.abs(Math.log(Math.max(em, 1e-6) / benchEm));
    if (levDev >= marginDev && levDev >= assetDev && em > benchEm) return 'leverage';
    if (assetDev >= marginDev && assetDev >= levDev) return 'assetEfficiency';
    return 'margin';
  }

  static empty(): DupontResult {
    return {
      threeFactor: {
        netProfitMargin: null,
        assetTurnover: null,
        equityMultiplier: null,
        calculatedROE: null,
        reportedROE: null,
        reconciliationDifference: null,
      },
      fiveFactor: {
        taxBurden: null,
        interestBurden: null,
        operatingMargin: null,
        assetTurnover: null,
        financialLeverage: null,
        calculatedROE: null,
      },
      primaryROEDriver: null,
    };
  }
}

export { avgTwo };