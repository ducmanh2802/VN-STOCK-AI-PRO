/**
 * ENGINE 6B — PIOTROSKI F-SCORE (classic 9 criteria)
 * 3 groups: Profitability (4), Leverage/Liquidity (3), Operating Efficiency (2).
 * MISSING DATA NEVER FAILS: a criterion with unavailable data is
 * `passed: null`, `dataAvailable: false` and is excluded from both the raw
 * and the normalized score.
 */
import type { PiotroskiCriterion, PiotroskiResult } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts } from './financialFacts.ts';
import { n, round2 } from './helpers.ts';

export interface PiotroskiContext {
  roaOf: (f: AnnualFinancialFact) => number | null;
  currentRatioOf: (f: AnnualFinancialFact) => number | null;
  grossMarginOf: (f: AnnualFinancialFact) => number | null;
  assetTurnoverOf: (f: AnnualFinancialFact) => number | null;
}

export class PiotroskiEngine {
  static evaluate(set: FinancialFactSet, ctx?: Partial<PiotroskiContext>): PiotroskiResult {
    const { current, previous } = latestFacts(set);
    if (!current) {
      return {
        total: null,
        maxAvailable: 0,
        normalizedScore: null,
        profitability: null,
        leverageLiquidity: null,
        operatingEfficiency: null,
        criteria: [],
      };
    }

    const roaOf = ctx?.roaOf ?? defaultROA;
    const currentRatioOf = ctx?.currentRatioOf ?? defaultCurrentRatio;
    const grossMarginOf = ctx?.grossMarginOf ?? defaultGrossMargin;
    const assetTurnoverOf = ctx?.assetTurnoverOf ?? defaultAssetTurnover;

    const c: PiotroskiCriterion[] = [];

    // ---- Profitability (4) ----
    const roaCur = roaOf(current);
    const roaPrev = previous ? roaOf(previous) : null;
    c.push(this.criterion('positive_roa', 'Positive ROA', roaCur, null, roaCur !== null ? roaCur > 0 : null, 'ROA > 0'));
    c.push(this.criterion('positive_cfo', 'Positive CFO', n(current.cfo), null, n(current.cfo) !== null ? (n(current.cfo)! > 0) : null, 'CFO > 0'));
    c.push(this.criterion('improving_roa', 'Improving ROA', roaCur, roaPrev, (roaCur !== null && roaPrev !== null) ? roaCur > roaPrev : null, 'ROA_current > ROA_previous'));
    const ni = n(current.netProfit);
    const cfoCur = n(current.cfo);
    c.push(this.criterion('cfo_gt_ni', 'CFO > Net Income', cfoCur, ni, (cfoCur !== null && ni !== null) ? cfoCur > ni : null, 'CFO > Net Income'));

    // ---- Leverage / Liquidity (3) ----
    const ldCur = leverageOf(current);
    const ldPrev = previous ? leverageOf(previous) : null;
    c.push(this.criterion('lower_leverage', 'Lower leverage', ldCur, ldPrev, (ldCur !== null && ldPrev !== null) ? ldCur < ldPrev : null, 'Long-term debt / avg assets decreased Y/Y'));

    const crCur = currentRatioOf(current);
    const crPrev = previous ? currentRatioOf(previous) : null;
    c.push(this.criterion('improving_liquidity', 'Improving liquidity', crCur, crPrev, (crCur !== null && crPrev !== null) ? crCur > crPrev : null, 'Current ratio improved Y/Y'));

    const shCur = n(current.sharesOutstanding);
    const shPrev = previous ? n(previous.sharesOutstanding) : null;
    c.push(this.criterion('no_share_issuance', 'No new share issuance', shCur, shPrev, (shCur !== null && shPrev !== null) ? shCur <= shPrev : null, 'Shares outstanding did not increase'));

    // ---- Operating Efficiency (2) ----
    const gmCur = grossMarginOf(current);
    const gmPrev = previous ? grossMarginOf(previous) : null;
    c.push(this.criterion('improving_gross_margin', 'Improving gross margin', gmCur, gmPrev, (gmCur !== null && gmPrev !== null) ? gmCur > gmPrev : null, 'Gross margin improved Y/Y'));

    const atCur = assetTurnoverOf(current);
    const atPrev = previous ? assetTurnoverOf(previous) : null;
    c.push(this.criterion('improving_asset_turnover', 'Improving asset turnover', atCur, atPrev, (atCur !== null && atPrev !== null) ? atCur > atPrev : null, 'Asset turnover improved Y/Y'));

    const available = c.filter((x) => x.dataAvailable);
    if (available.length === 0) {
      return {
        total: null,
        maxAvailable: 0,
        normalizedScore: null,
        profitability: null,
        leverageLiquidity: null,
        operatingEfficiency: null,
        criteria: c,
      };
    }

    const rawScore = available.filter((x) => x.passed === true).length;
    const normalizedScore = round2((rawScore / available.length) * 9);

    const passedIn = (ids: string[]) =>
      c.filter((x) => ids.includes(x.id) && x.passed === true).length;

    return {
      total: rawScore,
      maxAvailable: available.length,
      normalizedScore,
      profitability: passedIn(['positive_roa', 'positive_cfo', 'improving_roa', 'cfo_gt_ni']),
      leverageLiquidity: passedIn(['lower_leverage', 'improving_liquidity', 'no_share_issuance']),
      operatingEfficiency: passedIn(['improving_gross_margin', 'improving_asset_turnover']),
      criteria: c,
    };
  }

  private static criterion(
    id: string,
    name: string,
    value: number | null,
    previousValue: number | null,
    passed: boolean | null,
    reason: string
  ): PiotroskiCriterion {
    return {
      id,
      name,
      value,
      previousValue,
      passed,
      reason,
      dataAvailable: passed !== null,
    };
  }
}

function leverageOf(f: AnnualFinancialFact): number | null {
  const debt = n(f.longTermDebt) ?? n(f.totalLiabilities);
  const assets = n(f.totalAssets);
  if (debt === null || assets === null || assets === 0) return null;
  return debt / assets;
}

function defaultROA(f: AnnualFinancialFact): number | null {
  const ni = n(f.netProfit);
  const assets = n(f.totalAssets);
  if (ni === null || assets === null || assets === 0) return null;
  return (ni / assets) * 100;
}

function defaultCurrentRatio(f: AnnualFinancialFact): number | null {
  const ca = n(f.currentAssets);
  const cl = n(f.currentLiabilities);
  if (ca === null || cl === null || cl === 0) return null;
  return ca / cl;
}

function defaultGrossMargin(f: AnnualFinancialFact): number | null {
  const gp = n(f.grossProfit);
  const rev = n(f.revenue);
  if (gp === null || rev === null || rev === 0) return null;
  return (gp / rev) * 100;
}

function defaultAssetTurnover(f: AnnualFinancialFact): number | null {
  const rev = n(f.revenue);
  const assets = n(f.totalAssets);
  if (rev === null || assets === null || assets === 0) return null;
  return rev / assets;
}