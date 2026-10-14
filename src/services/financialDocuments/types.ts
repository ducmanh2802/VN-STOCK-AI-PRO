export type AuditStatus = 'AUDITED' | 'UNAUDITED' | 'REVIEWED';
export type MetricValidationStatus = 'VALID' | 'VALIDATED' | 'PROVISIONAL' | 'SUSPECT' | 'INVALID';

export type DataUnavailableReasonCode =
  | 'REQUIRED_LINE_ITEM_NOT_FOUND'
  | 'VALUE_NON_FINITE'
  | 'ZERO_DENOMINATOR'
  | 'PERIOD_MISMATCH'
  | 'NEGATIVE_BASE'
  | 'SOURCE_UNAVAILABLE'
  | 'STALE_DATA'
  | 'RESTATEMENT_CONFLICT'
  | 'CORRUPTED_DOCUMENT_STRUCTURE';

export type FinancialStatementType =
  | 'INCOME_STATEMENT'
  | 'BALANCE_SHEET'
  | 'CASH_FLOW_STATEMENT';

export type DocumentReportType = 'CONSOLIDATED' | 'PARENT_ONLY';

export type DeclaredUnit = 'DONG' | 'NGHIN_DONG' | 'TRIEU_DONG' | 'TY_DONG';

export interface FinancialDocument {
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
  reportType: DocumentReportType;
  auditStatus: AuditStatus;
  checksum?: string;
  declaredUnit?: DeclaredUnit;
  declaredCurrency?: string;
}
