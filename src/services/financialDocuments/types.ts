/**
 * PHASE 19.6 — AUTHORITATIVE FINANCIAL DOCUMENT PIPELINE: DATA CONTRACTS
 * ======================================================================
 * Strict interfaces and types for primary disclosure sources (HOSE, HNX, SSC,
 * Issuer IR) and secondary cross-checking sources (KBS, VPS, VNDIRECT).
 * 
 * Invariants:
 * 1. Zero tolerance for synthetic / fabricated data.
 * 2. Fail-closed: null/undefined/non-finite is NEVER converted to zero.
 * 3. Every extracted metric retains complete provenance and auditability.
 */

// ---------------------------------------------------------------------------
// 1. Sources & Formats
// ---------------------------------------------------------------------------

export type PrimaryFinancialSource = 'HOSE' | 'HNX' | 'SSC' | 'ISSUER_IR';

export type SecondaryFinancialSource = 'KBS' | 'VPS' | 'VNDIRECT';

export type FinancialDataSource = PrimaryFinancialSource | SecondaryFinancialSource;

export type DocumentFormat = 'PDF' | 'HTML' | 'XLS' | 'XLSX';

export type FinancialStatementType =
  | 'BALANCE_SHEET'             // Bảng cân đối kế toán
  | 'INCOME_STATEMENT'          // Báo cáo kết quả hoạt động kinh doanh
  | 'CASH_FLOW_DIRECT'          // Lưu chuyển tiền tệ (Trực tiếp)
  | 'CASH_FLOW_INDIRECT'        // Lưu chuyển tiền tệ (Gián tiếp)
  | 'NOTES_TO_FINANCIALS';      // Thuyết minh BCTC

export type FinancialReportType =
  | 'CONSOLIDATED'              // Hợp nhất
  | 'SEPARATE';                 // Riêng lẻ / Công ty mẹ

export type AuditStatus =
  | 'AUDITED'                   // Đã kiểm toán
  | 'REVIEWED'                  // Bán niên soát xét
  | 'UNAUDITED';                // Chưa kiểm toán (Quý / Tự lập)

export type ExtractionMethod =
  | 'NATIVE_TABLE_PARSER'       // Deterministic structured table parser
  | 'STRUCTURED_XLS'            // Excel workbook parser
  | 'HTML_DISCLOSURE'           // Regulatory HTML portal DOM parser
  | 'DOCUMENT_OCR';             // OCR text extraction engine

export type MetricValidationStatus =
  | 'VALIDATED'                 // Extracted and passed all deterministic integrity checks
  | 'RECONCILED'                // Reconciled against secondary cross-checking sources
  | 'CONFLICT'                  // Unreconciled divergence with secondary sources
  | 'UNAVAILABLE'               // Mark unavailable due to missing/invalid data
  | 'REJECTED';                 // Failed verification (e.g., unit/period mismatch)

// ---------------------------------------------------------------------------
// 2. Data Unavailable Reason Codes
// ---------------------------------------------------------------------------

export type DataUnavailableReasonCode =
  | 'MISSING_SOURCE_DOCUMENT'
  | 'REQUIRED_LINE_ITEM_NOT_FOUND'
  | 'VALUE_NON_FINITE'
  | 'UNVERIFIED_UNITS'
  | 'UNVERIFIED_PERIOD'
  | 'PERIOD_MISMATCH'
  | 'AMBIGUOUS_CONSOLIDATION_STATUS'
  | 'PROPOSED_DIVIDEND_NOT_PAID'
  | 'CAPEX_INFERRED_FROM_BALANCE_SHEET_FORBIDDEN'
  | 'CROSS_SOURCE_CONFLICT'
  | 'LOW_EXTRACTION_CONFIDENCE'
  | 'UNAUDITED_DISCREPANCY'
  | 'INSUFFICIENT_PROVENANCE'
  | 'CORRUPTED_DOCUMENT_STRUCTURE';

// ---------------------------------------------------------------------------
// 3. Extracted Metric Data Contract (Mandatory 17-field specification)
// ---------------------------------------------------------------------------

export interface ExtractedFinancialMetric {
  symbol: string;
  metric: string;
  value: number | null;
  currency: string;
  unit: string;
  period: string;
  periodEnd: string;
  statementType: FinancialStatementType;
  reportType: FinancialReportType;
  audited: boolean;
  sourceUrl: string;
  sourceDocumentId: string;
  sourcePublishedAt: string;
  extractedAt: string;
  extractionMethod: ExtractionMethod;
  confidence: number;
  validationStatus: MetricValidationStatus;
  unavailableReason?: DataUnavailableReasonCode;
  notes?: string;
}

// ---------------------------------------------------------------------------
// 4. Document Discovery & Metadata
// ---------------------------------------------------------------------------

export interface DiscoveredFinancialDocument {
  documentId: string;
  symbol: string;
  title: string;
  source: PrimaryFinancialSource;
  format: DocumentFormat;
  url: string;
  publishedAt: string;
  period: string;
  fiscalYear: number;
  periodEnd: string;
  reportType: FinancialReportType;
  auditStatus: AuditStatus;
  checksum: string;
  declaredUnit?: string;
  declaredCurrency?: string;
  fileSizeBytes?: number;
}

// ---------------------------------------------------------------------------
// 5. Raw Statement Line Items
// ---------------------------------------------------------------------------

export interface StatementLineItem {
  code?: string;                // VAS line item code (e.g., '20', '21', '36')
  nameVi: string;               // Vietnamese accounting description
  nameEn?: string;              // English translation if present
  valueRaw: string | number;    // Raw unparsed cell value
  noteRef?: string;             // Note index reference (e.g., 'V.01')
  pageNumber?: number;
  tableIndex?: number;
  confidence: number;
}

export interface ParsedFinancialStatement {
  documentId: string;
  symbol: string;
  statementType: FinancialStatementType;
  reportType: FinancialReportType;
  auditStatus: AuditStatus;
  period: string;
  periodEnd: string;
  currency: string;
  unit: string;
  lineItems: StatementLineItem[];
  extractionConfidence: number;
  extractedAt: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 6. Cross-Source Reconciliation Contracts
// ---------------------------------------------------------------------------

export interface SecondarySourceMetric {
  source: SecondaryFinancialSource;
  symbol: string;
  metric: string;
  period: string;
  value: number | null;
  unit: string;
  asOf: string;
}

export interface MetricReconciliationResult {
  metric: string;
  primaryMetric: ExtractedFinancialMetric;
  secondaryMetrics: SecondarySourceMetric[];
  isReconciled: boolean;
  divergencePercent: number | null;
  status: MetricValidationStatus;
  reasonCode?: DataUnavailableReasonCode;
  notes: string;
}

export interface DocumentPipelineResult {
  symbol: string;
  period: string;
  fiscalYear: number;
  reportType: FinancialReportType;
  audited: boolean;
  document: DiscoveredFinancialDocument;
  metrics: Record<string, ExtractedFinancialMetric>;
  reconciliations: Record<string, MetricReconciliationResult>;
  pipelineStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errors: string[];
  warnings: string[];
  executedAt: string;
}
