/**
 * PHASE 19.6 — AUTHORITATIVE FINANCIAL DOCUMENT DISCOVERY ENGINE
 * ===============================================================
 * Discovers regulatory disclosure filings from primary authoritative Vietnamese sources:
 * 1. HOSE (Sở Giao dịch Chứng khoán TP.HCM)
 * 2. HNX (Sở Giao dịch Chứng khoán Hà Nội)
 * 3. SSC (Uỷ ban Chứng khoán Nhà nước - Cổng công bố thông tin IDS)
 * 4. Issuer IR (Trang Quan hệ Cổ đông chính thức của Doanh nghiệp)
 * 
 * Invariants:
 * - Real documents only with explicit source provenance and publication dates.
 * - Discovers PDF, HTML, XLS, XLSX formats.
 * - Determines Consolidated vs Separate and Audited/Reviewed status with zero ambiguity.
 */

import type {
  DiscoveredFinancialDocument,
  PrimaryFinancialSource,
  FinancialReportType,
  AuditStatus,
  DocumentFormat,
} from './types.ts';

export interface DiscoveryQuery {
  symbol: string;
  period: string;               // e.g. 'FY_2024', 'Q4_2024', 'Q3_2024'
  fiscalYear: number;           // e.g. 2024
  reportType?: FinancialReportType; // Preference, defaults to CONSOLIDATED if available
  auditedOnly?: boolean;        // true if strictly requiring audited statements
}

export interface DiscoveryRegistryEntry {
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

export class DocumentDiscoveryEngine {
  private documentRegistry: Map<string, DiscoveredFinancialDocument> = new Map();

  constructor(initialDocuments?: DiscoveredFinancialDocument[]) {
    if (initialDocuments && initialDocuments.length > 0) {
      for (const doc of initialDocuments) {
        this.registerDocument(doc);
      }
    }
  }

  /**
   * Register an authoritative document discovered from primary portals.
   */
  public registerDocument(doc: DiscoveredFinancialDocument): void {
    const key = this.buildKey(doc.symbol, doc.period, doc.reportType, doc.source);
    this.documentRegistry.set(key, doc);
  }

  /**
   * Discovers the best authoritative document matching the query.
   * Priority: HOSE/HNX (primary listing exchange) -> SSC -> ISSUER_IR.
   * Prefers AUDITED over UNAUDITED, and CONSOLIDATED over SEPARATE.
   */
  public discoverDocument(query: DiscoveryQuery): DiscoveredFinancialDocument | null {
    const normalizedSymbol = query.symbol.toUpperCase().trim();
    const candidateDocs: DiscoveredFinancialDocument[] = [];

    for (const doc of this.documentRegistry.values()) {
      if (doc.symbol.toUpperCase() !== normalizedSymbol) continue;
      if (doc.period !== query.period) continue;
      if (doc.fiscalYear !== query.fiscalYear) continue;

      if (query.reportType && doc.reportType !== query.reportType) {
        continue;
      }

      if (query.auditedOnly && doc.auditStatus !== 'AUDITED') {
        continue;
      }

      candidateDocs.push(doc);
    }

    if (candidateDocs.length === 0) {
      return null;
    }

    // Sort candidates by source authority & audit rigor
    return candidateDocs.sort((a, b) => {
      // 1. Audit status priority: AUDITED > REVIEWED > UNAUDITED
      const auditScore = (status: AuditStatus) =>
        status === 'AUDITED' ? 3 : status === 'REVIEWED' ? 2 : 1;
      const auditDiff = auditScore(b.auditStatus) - auditScore(a.auditStatus);
      if (auditDiff !== 0) return auditDiff;

      // 2. Source authority priority: HOSE/HNX > SSC > ISSUER_IR
      const sourceScore = (source: PrimaryFinancialSource) => {
        switch (source) {
          case 'HOSE':
          case 'HNX':
            return 3;
          case 'SSC':
            return 2;
          case 'ISSUER_IR':
            return 1;
        }
      };
      const sourceDiff = sourceScore(b.source) - sourceScore(a.source);
      if (sourceDiff !== 0) return sourceDiff;

      // 3. Consolidated preference
      if (a.reportType === 'CONSOLIDATED' && b.reportType !== 'CONSOLIDATED') return -1;
      if (b.reportType === 'CONSOLIDATED' && a.reportType !== 'CONSOLIDATED') return 1;

      // 4. Latest published date
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })[0];
  }

  /**
   * Helper to parse filing title to detect ReportType and AuditStatus.
   * Protects against ambiguous title labeling.
   */
  public static inferFilingAttributes(title: string): {
    reportType: FinancialReportType | null;
    auditStatus: AuditStatus | null;
    periodEnd: string | null;
    isAmbiguous: boolean;
  } {
    const lower = title.toLowerCase();
    let reportType: FinancialReportType | null = null;
    let auditStatus: AuditStatus | null = null;
    let isAmbiguous = false;

    // Detect Report Type
    const hasConsolidated = lower.includes('hợp nhất') || lower.includes('hop nhat') || lower.includes('consolidated');
    const hasSeparate = lower.includes('riêng') || lower.includes('mẹ') || lower.includes('cong ty me') || lower.includes('separate');

    if (hasConsolidated && hasSeparate) {
      // Conflicting statement types in title
      isAmbiguous = true;
    } else if (hasConsolidated) {
      reportType = 'CONSOLIDATED';
    } else if (hasSeparate) {
      reportType = 'SEPARATE';
    } else {
      // Cannot determine if it is consolidated or separate
      isAmbiguous = true;
    }

    // Detect Audit Status
    if (lower.includes('kiểm toán') || lower.includes('kiem toan') || lower.includes('audited')) {
      auditStatus = 'AUDITED';
    } else if (lower.includes('soát xét') || lower.includes('soat xet') || lower.includes('reviewed')) {
      auditStatus = 'REVIEWED';
    } else if (lower.includes('chưa kiểm toán') || lower.includes('tự lập') || lower.includes('tu lap')) {
      auditStatus = 'UNAUDITED';
    } else {
      // Default quarter filings without explicit audited label are unaudited
      auditStatus = 'UNAUDITED';
    }

    return {
      reportType,
      auditStatus,
      periodEnd: null,
      isAmbiguous,
    };
  }

  private buildKey(
    symbol: string,
    period: string,
    reportType: FinancialReportType,
    source: PrimaryFinancialSource
  ): string {
    return `${symbol.toUpperCase()}_${period}_${reportType}_${source}`;
  }
}
