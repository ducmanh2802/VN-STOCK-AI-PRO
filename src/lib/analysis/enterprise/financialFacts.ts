/**
 * PHASE 6 — Financial Fact Layer.
 *
 * Converts heterogeneous real sources (VPS fundamentals, PostgreSQL financial
 * statements/ratios) into a single normalized representation used by the
 * deterministic engines. Units are CANONICAL: currency = VND; flows are annual;
 * per-share = VND/share.
 *
 * Every field is `number | null`: `null` = the source did not report it.
 * Nothing here is ever estimated, averaged, or fabricated.
 */
import { isNumber, n } from './helpers.ts';
import type { VpsNormalizedFundamentals } from '../../../services/market/providers/vps/types.ts';

// ---------------------------------------------------------------------------
// Canonical normalized financial facts for one fiscal year
// ---------------------------------------------------------------------------
export interface AnnualFinancialFact {
  year: number;
  period: string | null;
  source: string;
  calculationMethod: 'average' | 'period_end';
  revenue: number | null;
  grossProfit: number | null;
  operatingProfit: number | null; // EBIT / operating profit
  ebitda: number | null;
  netProfit: number | null; // Net income
  cfo: number | null; // Operating cash flow
  capex: number | null; // Investing cash flow magnitude (positive)
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null; // Shareholders' equity
  currentAssets: number | null;
  currentLiabilities: number | null;
  cash: number | null;
  inventory: number | null;
  receivables: number | null;
  interestExpense: number | null;
  longTermDebt: number | null;
  sharesOutstanding: number | null;
  eps: number | null;
  bvps: number | null;
}

export const EMPTY_FACT: AnnualFinancialFact = {
  year: 0,
  period: null,
  source: 'NONE',
  calculationMethod: 'period_end',
  revenue: null,
  grossProfit: null,
  operatingProfit: null,
  ebitda: null,
  netProfit: null,
  cfo: null,
  capex: null,
  totalAssets: null,
  totalLiabilities: null,
  totalEquity: null,
  currentAssets: null,
  currentLiabilities: null,
  cash: null,
  inventory: null,
  receivables: null,
  interestExpense: null,
  longTermDebt: null,
  sharesOutstanding: null,
  eps: null,
  bvps: null,
};

export interface FinancialFactSet {
  /** Annual facts, sorted ascending by `year`. */
  annals: AnnualFinancialFact[];
}

export function hasFinancialData(fact: AnnualFinancialFact | null | undefined): boolean {
  if (!fact) return false;
  return (
    isNumber(fact.revenue) ||
    isNumber(fact.netProfit) ||
    isNumber(fact.totalAssets) ||
    isNumber(fact.cfo)
  );
}

// ---------------------------------------------------------------------------
// Normalizer: VPS fundamentals annual series
// ---------------------------------------------------------------------------
export function normalizeVpsAnnualFundamentals(fundamentals: VpsNormalizedFundamentals): AnnualFinancialFact[] {
  const annual = fundamentals.annual;
  const years = fundamentals.annualPeriods ?? [];
  const facts: AnnualFinancialFact[] = [];

  for (let i = 0; i < 4; i++) {
    const rev = n(annual.netRevenue[i]);
    const gp = n(annual.grossProfit[i]);
    const op = n(annual.operatingProfit[i]);
    const np = n(annual.netProfit[i]);
    const ta = n(annual.totalAssets[i]);
    const liab = n(annual.liabilities[i]);
    const eq = n(annual.equity[i]);
    const eps = n(annual.eps[i]);
    const bvps = n(annual.bvps[i]);

    if (rev === null && np === null && ta === null) continue;

    const yearLabel = years[i];
    facts.push({
      year: 2000 + i,
      period: yearLabel?.sourceLabel ?? null,
      source: 'VPS',
      calculationMethod: 'period_end',
      revenue: rev !== null ? rev * 1e6 : null,
      grossProfit: gp !== null ? gp * 1e6 : null,
      operatingProfit: op !== null ? op * 1e6 : null,
      ebitda: null,
      netProfit: np !== null ? np * 1e6 : null,
      cfo: null,
      capex: null,
      totalAssets: ta !== null ? ta * 1e6 : null,
      totalLiabilities: liab !== null ? liab * 1e6 : null,
      totalEquity: eq !== null ? eq * 1e6 : null,
      currentAssets: null,
      currentLiabilities: null,
      cash: null,
      inventory: null,
      receivables: null,
      interestExpense: null,
      longTermDebt: null,
      sharesOutstanding: null,
      eps: eps !== null && eps !== undefined ? eps : null,
      bvps: bvps !== null && bvps !== undefined ? bvps : null,
    });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Normalizer: PostgreSQL financial statements (IS/BS/CF)
// ---------------------------------------------------------------------------
export interface StatementInput {
  year: number;
  statementType?: string | null;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingProfit?: number | null;
  netProfit?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  totalEquity?: number | null;
  operatingCashFlow?: number | null;
  investingCashFlow?: number | null;
}

/**
 * Merges IS/BS/CF rows for the same year into one normalized fact (VND).
 */
export function mergeStatementRows(rows: StatementInput[], outstandingShares?: number | null): AnnualFinancialFact[] {
  const byYear = new Map<number, StatementInput[]>();
  for (const r of rows) {
    const list = byYear.get(r.year) ?? [];
    list.push(r);
    byYear.set(r.year, list);
  }

  const facts: AnnualFinancialFact[] = [];
  for (const [year, group] of byYear) {
    const pick = <T>(getter: (r: StatementInput) => T | null | undefined, prefer: string): T | null => {
      const order = [prefer, 'IS', 'BS', 'CF'].filter((o, i) => [prefer, 'IS', 'BS', 'CF'].indexOf(o) === i);
      for (const typeOrder of order) {
        const row = group.find((r) => r.statementType === typeOrder);
        if (row) {
          const v = getter(row);
          if (v !== null && v !== undefined) return v as T;
        }
      }
      for (const r of group) {
        const v = getter(r);
        if (v !== null && v !== undefined) return v as T;
      }
      return null as T;
    };

    const capexRaw = pick((r) => n(r.investingCashFlow), 'CF');
    const capex = capexRaw !== null ? Math.abs(capexRaw) : null;

    const fact: AnnualFinancialFact = {
      ...EMPTY_FACT,
      year,
      period: `FY${year}`,
      source: 'PostgreSQL financial_statements',
      calculationMethod: 'period_end',
      revenue: pick((r) => n(r.revenue), 'IS'),
      grossProfit: pick((r) => n(r.grossProfit), 'IS'),
      operatingProfit: pick((r) => n(r.operatingProfit), 'IS'),
      netProfit: pick((r) => n(r.netProfit), 'IS'),
      cfo: pick((r) => n(r.operatingCashFlow), 'CF'),
      capex: capex !== null && capex > 0 ? capex : null,
      totalAssets: pick((r) => n(r.totalAssets), 'BS'),
      totalLiabilities: pick((r) => n(r.totalLiabilities), 'BS'),
      totalEquity: pick((r) => n(r.totalEquity), 'BS'),
      sharesOutstanding: n(outstandingShares),
    };

    if (fact.netProfit !== null && fact.sharesOutstanding !== null && fact.sharesOutstanding! > 0) {
      fact.eps = fact.netProfit / fact.sharesOutstanding!;
    }
    if (fact.totalEquity !== null && fact.sharesOutstanding !== null && fact.sharesOutstanding! > 0) {
      fact.bvps = fact.totalEquity / fact.sharesOutstanding!;
    }
    facts.push(fact);
  }
  return facts.sort((a, b) => a.year - b.year);
}

// ---------------------------------------------------------------------------
// Company + market + peer context
// ---------------------------------------------------------------------------
export interface CompanyProfile {
  symbol: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  outstandingShares: number | null;
  businessDescription: string | null;
}

export interface MarketSnapshot {
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  tradingDate: string | null;
  source: string | null;
  marketCap: number | null;
}

export interface PeerFact {
  symbol: string;
  name?: string | null;
  sector?: string | null;
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
  evidenceDate: string | null;
}

/** Configurable, documented model defaults. Never hidden. */
export interface EnterpriseConfig {
  wacc: number;
  terminalGrowth: number;
  targetPE: number;
  targetPB: number;
  dcfYears: number;
  bullProbability: number;
  baseProbability: number;
  bearProbability: number;
  maxDcfGrowthMultiple: number;
  cashConversionHigh: number;
  cashConversionPartial: number;
}

export const DEFAULT_CONFIG: EnterpriseConfig = {
  wacc: 0.10,
  terminalGrowth: 0.03,
  targetPE: 15,
  targetPB: 1.8,
  dcfYears: 5,
  bullProbability: 0.25,
  baseProbability: 0.5,
  bearProbability: 0.25,
  maxDcfGrowthMultiple: 2.5,
  cashConversionHigh: 1.0,
  cashConversionPartial: 0.7,
};

export interface EnterpriseInput {
  company: CompanyProfile;
  facts: FinancialFactSet;
  market: MarketSnapshot;
  peers: PeerFact[];
  config: EnterpriseConfig;
  historicalPrices?: number[];
  asOfDate: string | null;
}

/** Convenience: the most recent fact and the previous one. */
export function latestFacts(set: FinancialFactSet): { current: AnnualFinancialFact | null; previous: AnnualFinancialFact | null } {
  const sorted = [...set.annals].sort((a, b) => a.year - b.year);
  return {
    current: sorted[sorted.length - 1] ?? null,
    previous: sorted[sorted.length - 2] ?? null,
  };
}