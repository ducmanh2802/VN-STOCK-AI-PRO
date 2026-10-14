import type { CanonicalFinancialFact, FinancialPeriod } from '../../lib/earnings/types.ts';
import type { DataFreshnessStatus } from '../../types/stock.ts';
import { FinancialPeriodEngine } from '../../lib/earnings/FinancialPeriodEngine.ts';

export interface EarningsFactRequest {
  symbol: string;
  period: string; // e.g. 'FY_2023', 'Q1_2024'
  fiscalYear: number;
  reportType: 'CONSOLIDATED' | 'SEPARATE';
  rawPayload: {
    document: {
      documentId: string;
      symbol: string;
      title: string;
      source: string;
      format: string;
      url?: string;
      publishedAt: string;
      period: string;
      fiscalYear: number;
      periodEnd: string;
      reportType: 'CONSOLIDATED' | 'SEPARATE';
      auditStatus: 'AUDITED' | 'UNAUDITED' | 'REVIEWED';
      checksum?: string;
      declaredUnit?: string;
      declaredCurrency?: string;
    };
    statementType: 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW';
    declaredUnit?: string;
    lines: Array<{
      code: string;
      nameVi: string;
      valueRaw: string | number;
      confidence?: number;
    }>;
  };
}

export function combineFreshness(statuses: (DataFreshnessStatus | null | undefined)[]): DataFreshnessStatus {
  const valid = statuses.filter(Boolean) as DataFreshnessStatus[];
  if (valid.length === 0) return 'UNAVAILABLE';
  if (valid.some((s) => s === 'INVALID')) return 'INVALID';
  if (valid.some((s) => s === 'UNAVAILABLE')) return 'UNAVAILABLE';
  if (valid.some((s) => s === 'STALE')) return 'STALE';
  return 'CURRENT';
}

export class EarningsDataProvider {
  public static parseDocument(req: EarningsFactRequest): CanonicalFinancialFact[] {
    const doc = req.rawPayload.document;
    const cleanSymbol = req.symbol.trim().toUpperCase();
    const periodObj: FinancialPeriod = req.period.startsWith('FY_')
      ? FinancialPeriodEngine.cumulative(req.fiscalYear, 'FY')
      : FinancialPeriodEngine.quarter(req.fiscalYear, 1);

    const unitMultiplier = req.rawPayload.declaredUnit === 'TRIEU_DONG' ? 1_000_000 : 1;
    const facts: CanonicalFinancialFact[] = [];

    for (const line of req.rawPayload.lines) {
      let numVal: number | null = null;
      if (typeof line.valueRaw === 'number') {
        numVal = line.valueRaw * unitMultiplier;
      } else if (typeof line.valueRaw === 'string') {
        const cleaned = line.valueRaw.replace(/\./g, '').replace(/,/g, '.');
        const parsed = parseFloat(cleaned);
        if (Number.isFinite(parsed)) {
          numVal = parsed * unitMultiplier;
        }
      }

      let lineItem = line.code;
      if (line.code === '10' || line.nameVi.includes('Doanh thu')) lineItem = 'NET_REVENUE';
      else if (line.code === '60' || line.nameVi.includes('Lợi nhuận sau thuế')) lineItem = 'NET_PROFIT';

      facts.push({
        symbol: cleanSymbol,
        metric: lineItem,
        statementType: req.rawPayload.statementType,
        reportType: req.reportType,
        period: periodObj,
        value: numVal,
        currency: 'VND',
        unit: 'VND',
        audited: doc.auditStatus === 'AUDITED',
        auditStatus: doc.auditStatus,
        restatementStatus: 'ORIGINAL',
        restatementVersion: 0,
        reportId: doc.documentId,
        statementId: doc.documentId,
        publicationDate: doc.publishedAt.slice(0, 10),
        source: doc.source,
        sourceTier: 'TIER_2_EXCHANGE',
        freshness: 'CURRENT',
        validationStatus: 'VALID',
        lineage: {
          sources: [doc.source],
          engine: 'EarningsDataProvider',
          calculationVersion: 'v1.0.0',
          statementId: doc.documentId,
          reportId: doc.documentId,
          publicationDate: doc.publishedAt.slice(0, 10),
          auditStatus: doc.auditStatus,
        },
      });
    }

    return facts;
  }
}
