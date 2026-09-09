/**
 * ENGINE 7 — VALUATION INTELLIGENCE ENGINE
 *
 * Independent valuation methods: P/E, P/B, EV/EBITDA, historical & peer
 * positioning, plus fair values from DCF, P/E and P/B. Fair values are only
 * computed when valid inputs exist (never fabricated, never `price * multiplier`).
 */
import type { ValuationIntelligenceResult } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts, EnterpriseConfig } from './financialFacts.ts';
import { freeCashFlowOf } from './GrowthEngine.ts';
import { n, round2, percentileRank, cagr, clamp } from './helpers.ts';

export interface ValuationEngineInput {
  facts: FinancialFactSet;
  price: number | null;
  peers: Array<{ pe: number | null; pb: number | null; evEbitda: number | null }>;
  config: EnterpriseConfig;
  historicalPE?: number[];
  historicalPB?: number[];
  historicalFCF?: number[];
}

export class ValuationIntelligenceEngine {
  static evaluate(input: ValuationEngineInput): ValuationIntelligenceResult {
    const { current, previous } = latestFacts(input.facts);
    const price = n(input.price);

    const eps = this.normalizedEPS(current, previous);
    const bvps = n(current?.bvps) ??
      (n(current?.totalEquity) !== null && n(current?.sharesOutstanding) !== null && current!.sharesOutstanding! > 0
        ? current!.totalEquity! / current!.sharesOutstanding!
        : null);

    const pe = price && eps && price > 0 && eps > 0 ? round2(price / eps) : null;
    const pb = price && bvps && price > 0 && bvps > 0 ? round2(price / bvps) : null;

    // EV / EBITDA
    const ebitda = n(current?.ebitda) ?? n(current?.operatingProfit);
    let evEbitda: number | null = null;
    if (ebitda !== null && ebitda > 0 && price !== null) {
      const netDebt = this.netDebt(current);
      const marketCap = current?.sharesOutstanding ? price * current.sharesOutstanding! : null;
      const ev = (marketCap ?? 0) + (netDebt ?? 0);
      if (ev > 0) evEbitda = round2(ev / ebitda);
    }

    const historicalPEPercentile = percentileRank(pe, input.historicalPE ?? []);
    const historicalPBPercentile = percentileRank(pb, input.historicalPB ?? []);

    const peerPE = peerMedian(input.peers.map((p) => p.pe));
    const peerPB = peerMedian(input.peers.map((p) => p.pb));
    const peerPEPremiumDiscount = pe && peerPE ? round2(((pe - peerPE) / peerPE) * 100) : null;
    const peerPBPremiumDiscount = pb && peerPB ? round2(((pb - peerPB) / peerPB) * 100) : null;

    // Fair values — only when valid inputs exist.
    const peFairValue = eps && eps > 0 ? round2(eps * input.config.targetPE) : null;
    const pbFairValue = bvps && bvps > 0 ? round2(bvps * input.config.targetPB) : null;
    const dcfFairValue = this.dcfFairValue(input);

    const fairValues = [peFairValue, pbFairValue, dcfFairValue].filter((v): v is number => v !== null);
    const compositeFairValue = fairValues.length > 0 ? round2(fairValues.reduce((a, b) => a + b, 0) / fairValues.length) : null;

    const marginOfSafety =
      compositeFairValue !== null && price && price > 0
        ? round2(((compositeFairValue - price) / compositeFairValue) * 100)
        : null;

    const score = this.score(marginOfSafety, historicalPEPercentile, peerPEPremiumDiscount, compositeFairValue);

    return {
      score,
      pe,
      pb,
      evEbitda,
      historicalPEPercentile: historicalPEPercentile !== null ? round2(historicalPEPercentile * 100) : null,
      historicalPBPercentile: historicalPBPercentile !== null ? round2(historicalPBPercentile * 100) : null,
      peerPEPremiumDiscount,
      peerPBPremiumDiscount,
      dcfFairValue,
      peFairValue,
      pbFairValue,
      marginOfSafety,
      currentPrice: price,
    };
  }

  /** Normalized EPS: prefer source EPS; else Net Income / diluted shares. */
  static normalizedEPS(current: AnnualFinancialFact | null, previous: AnnualFinancialFact | null): number | null {
    if (!current) return null;
    if (n(current.eps) !== null) return current.eps;
    const ni = n(current.netProfit);
    const shares = n(current.sharesOutstanding) ?? n(previous?.sharesOutstanding);
    if (ni !== null && shares !== null && shares > 0) return ni / shares;
    return null;
  }

  static netDebt(current: AnnualFinancialFact | null): number | null {
    if (!current) return null;
    const debt = n(current.longTermDebt) ?? n(current.totalLiabilities);
    const cash = n(current.cash);
    if (debt === null || cash === null) return null;
    return debt - cash;
  }

  /**
   * 2-stage DCF on FCF. TV = FCF_n * (1 + g) / (WACC - g); equity value minus
   * net debt, divided by diluted shares. Only when all inputs valid.
   */
  static dcfFairValue(input: ValuationEngineInput): number | null {
    const { current, previous } = latestFacts(input.facts);
    if (!current) return null;
    const fcf = freeCashFlowOf(current);
    const shares = n(current.sharesOutstanding) ?? n(previous?.sharesOutstanding);
    if (fcf === null || fcf <= 0 || shares === null || shares <= 0) return null;

    const wacc = input.config.wacc;
    const g = input.config.terminalGrowth;
    if (wacc <= g) return null;

    let g1: number | null = null;
    if (input.historicalFCF && input.historicalFCF.length >= 2) {
      const gCagr = cagr(input.historicalFCF[input.historicalFCF.length - 1], input.historicalFCF[0], input.historicalFCF.length - 1);
      if (gCagr !== null) {
        g1 = clamp(gCagr / 100, 0, Math.max(g, 0.05));
      }
    }
    const projectionGrowth = Math.max(g, g1 ?? g);

    let pvFCF = 0;
    let cf = fcf;
    for (let t = 1; t <= input.config.dcfYears; t++) {
      cf = cf * (1 + projectionGrowth);
      pvFCF += cf / Math.pow(1 + wacc, t);
    }
    const terminalValue = (cf * (1 + g)) / (wacc - g);
    const ev = pvFCF + terminalValue / Math.pow(1 + wacc, input.config.dcfYears);
    const netDebt = this.netDebt(current) ?? 0;
    const equityValue = ev - netDebt;
    if (equityValue <= 0) return null;
    return round2(equityValue / shares);
  }

  private static score(
    mos: number | null,
    histPct: number | null,
    peerPremium: number | null,
    fairValue: number | null
  ): number | null {
    if (fairValue === null) return null;
    const subs: number[] = [];
    if (mos !== null) subs.push(clamp((mos + 30) * 1.5, 0, 100));
    if (histPct !== null) subs.push(clamp((1 - histPct) * 110, 0, 100));
    if (peerPremium !== null) subs.push(clamp(60 - peerPremium * 2, 0, 100));
    if (subs.length === 0) return 50;
    return round2(subs.reduce((a, b) => a + b, 0) / subs.length);
  }
}

function peerMedian(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
  if (present.length === 0) return null;
  const mid = Math.floor(present.length / 2);
  if (present.length % 2 === 1) return present[mid];
  return (present[mid - 1] + present[mid]) / 2;
}