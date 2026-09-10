import type { AnnualFinancialFact, FinancialFactSet } from '../enterprise/financialFacts.ts';

export type CompanyType = 'INDUSTRIAL' | 'TECHNOLOGY_SERVICES' | 'BANK' | 'UNKNOWN';
export type DataStatus = 'OK' | 'DATA_UNAVAILABLE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';

export interface Evidence {
  source: string;
  period: string | null;
  statement: 'Income Statement' | 'Balance Sheet' | 'Cash Flow Statement' | 'Derived';
  lineItem: string;
  dataDate: string | null;
}

export interface Metric { value: number | null; unit: '%' | 'VND' | 'x'; evidence: Evidence[]; }
export interface Explanation {
  title: string; summary: string; evidence: string[]; interpretation: string; risk: string; whatInvestorShouldWatch: string;
}
export interface CapitalAllocationInput {
  symbol: string;
  companyType?: CompanyType;
  facts: FinancialFactSet;
  asOfDate: string | null;
  /** Cash dividends paid. Must originate from a cash-flow statement or verified dividend record. */
  dividendsPaid?: Map<number, number | null>;
  /** Cash used for acquisitions/investments; positive outflow. */
  investments?: Map<number, number | null>;
  /** Cash paid for share repurchases; positive outflow. */
  buybacks?: Map<number, number | null>;
  /** Cash raised from issuing equity; positive inflow. */
  equityRaised?: Map<number, number | null>;
}
export interface CapitalAllocationResult {
  symbol: string; period: string | null; companyType: CompanyType; dataStatus: DataStatus;
  unavailableReasons: string[]; score: number | null; confidence: Confidence; dataCompleteness: number;
  metrics: Record<string, Metric>; normalizedPer1000Billion: { dividend: number | null; retained: number | null };
  explanations: Explanation[]; evidence: Evidence[]; investorWatchlist: string[];
}
export type { AnnualFinancialFact };
