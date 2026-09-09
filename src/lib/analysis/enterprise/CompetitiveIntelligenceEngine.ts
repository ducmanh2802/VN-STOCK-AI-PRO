/**
 * ENGINE 8 — COMPETITIVE INTELLIGENCE ENGINE
 * Ranks the company against real peers metric-by-metric and derives a
 * composite relative-position score. "Higher is better" metrics rank 1 =
 * best; "lower is better" metrics (debt, valuation multiples) rank 1 = lowest.
 * Uses median comparisons so extreme outliers don't distort ranks.
 */
import type { CompetitiveResult } from '../../../types/enterpriseIntelligence.ts';
import { PeerFact } from './financialFacts.ts';
import { round2, clamp } from './helpers.ts';

export interface CompanyMetrics {
  revenueGrowth: number | null;
  roe: number | null;
  roic: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  debtToEquity: number | null;
  fcfMargin: number | null;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  marketCap: number | null;
}

type MetricDef = {
  key: string;
  label: string;
  company: number | null;
  higherBetter: boolean;
  get: (p: PeerFact) => number | null;
};

export class CompetitiveIntelligenceEngine {
  static evaluate(company: CompanyMetrics, peers: PeerFact[]): CompetitiveResult {
    const active = peers.filter((p) => hasAnyData(p));
    const peerCount = active.length;

    if (peerCount === 0) {
      return {
        score: null,
        rank: null,
        peerCount: 0,
        growthRank: null,
        profitabilityRank: null,
        valuationRank: null,
        financialHealthRank: null,
        peers: [],
      };
    }

    const defs = this.defs(company);
    const peersOutput: CompetitiveResult['peers'] = [];

    let rankSum = 0;
    let rankCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    for (const def of defs) {
      const values = active.map((p) => def.get(p)).filter((v): v is number => v !== null);
      if (values.length === 0 || def.company === null) continue;

      const companyRank = rankOf(def.company, values, def.higherBetter);
      if (companyRank === null) continue;
      rankSum += companyRank;
      rankCount += 1;

      const median = medianOf(values);
      let rel: number;
      if (def.higherBetter) {
        rel = median > 0 ? def.company / median : def.company / (median || 1);
      } else {
        rel = def.company > 0 && median > 0 ? median / def.company : 0.5;
      }
      const sub = clamp(rel * 80, 0, 100);
      scoreSum += sub;
      scoreCount += 1;

      peersOutput.push({
        symbol: def.key,
        name: def.label,
        value: round2(def.company),
        rank: companyRank,
      });
    }

    const growthRank = rankCategory(company, active, 'growth');
    const profitabilityRank = rankCategory(company, active, 'profitability');
    const valuationRank = rankCategory(company, active, 'valuation');
    const financialHealthRank = rankCategory(company, active, 'health');

    const overallRank = rankCount > 0 ? Math.round(rankSum / rankCount) : null;

    return {
      score: scoreCount > 0 ? round2(scoreSum / scoreCount) : null,
      rank: overallRank,
      peerCount,
      growthRank,
      profitabilityRank,
      valuationRank,
      financialHealthRank,
      peers: peersOutput,
    };
  }

  private static defs(c: CompanyMetrics): MetricDef[] {
    return [
      def('revenueGrowth', 'Revenue Growth', c.revenueGrowth, true, (p) => p.revenueGrowth),
      def('roe', 'ROE', c.roe, true, (p) => p.roe),
      def('roic', 'ROIC', c.roic, true, (p) => p.roic),
      def('netMargin', 'Net Margin', c.netMargin, true, (p) => p.netMargin),
      def('grossMargin', 'Gross Margin', c.grossMargin, true, (p) => p.grossMargin),
      def('operatingMargin', 'Operating Margin', c.operatingMargin, true, (p) => p.operatingMargin),
      def('debtToEquity', 'Debt/Equity', c.debtToEquity, false, (p) => p.debtToEquity),
      def('fcfMargin', 'FCF Margin', c.fcfMargin, true, (p) => p.fcfMargin),
      def('pe', 'P/E', c.pe, false, (p) => p.pe),
      def('pb', 'P/B', c.pb, false, (p) => p.pb),
      def('evEbitda', 'EV/EBITDA', c.evEbitda, false, (p) => p.evEbitda),
    ];
  }
}

function def(
  key: string,
  label: string,
  company: number | null,
  higherBetter: boolean,
  get: (p: PeerFact) => number | null
): MetricDef {
  return { key, label, company, higherBetter, get };
}

function hasAnyData(p: PeerFact): boolean {
  return (
    p.revenueGrowth !== null || p.roe !== null || p.netMargin !== null ||
    p.pe !== null || p.pb !== null || p.debtToEquity !== null
  );
}

function rankOf(value: number, others: number[], higherBetter: boolean): number {
  if (others.length === 0) return 1;
  let rank = 1;
  for (const o of others) {
    if (higherBetter && o > value) rank += 1;
    if (!higherBetter && o < value) rank += 1;
  }
  return rank;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

type Category = 'growth' | 'profitability' | 'valuation' | 'health';

function rankCategory(company: CompanyMetrics, peers: PeerFact[], cat: Category): number | null {
  const picks: Array<{ label: string; company: number | null; get: (p: PeerFact) => number | null }> =
    cat === 'growth'
      ? [{ label: 'revenueGrowth', company: company.revenueGrowth, get: (p) => p.revenueGrowth }]
      : cat === 'profitability'
        ? [
            { label: 'roe', company: company.roe, get: (p) => p.roe },
            { label: 'netMargin', company: company.netMargin, get: (p) => p.netMargin },
            { label: 'roic', company: company.roic, get: (p) => p.roic },
          ]
        : cat === 'valuation'
          ? [
              { label: 'pe', company: company.pe, get: (p) => p.pe },
              { label: 'pb', company: company.pb, get: (p) => p.pb },
            ]
          : [
              { label: 'debtToEquity', company: company.debtToEquity, get: (p) => p.debtToEquity },
              { label: 'fcfMargin', company: company.fcfMargin, get: (p) => p.fcfMargin },
            ];

  const ranks: number[] = [];
  for (const pick of picks) {
    if (pick.company === null) continue;
    const values = peers.map((p) => pick.get(p)).filter((v): v is number => v !== null);
    if (values.length === 0) continue;
    const higherBetter = !['pe', 'pb', 'debtToEquity'].includes(pick.label);
    ranks.push(rankOf(pick.company, values, higherBetter));
  }
  if (ranks.length === 0) return null;
  return Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
}