/**
 * PHASE 19.6 — AUTHORITATIVE FINANCIAL DOCUMENT PIPELINE ACCEPTANCE TESTS
 * =======================================================================
 * Acceptance test suite validating all invariants and requirements:
 * 1. Missing CFO -> DATA_UNAVAILABLE (REQUIRED_LINE_ITEM_NOT_FOUND)
 * 2. Missing CAPEX -> DATA_UNAVAILABLE (REQUIRED_LINE_ITEM_NOT_FOUND)
 * 3. Missing actual cash dividend -> DATA_UNAVAILABLE (REQUIRED_LINE_ITEM_NOT_FOUND)
 * 4. Approved/proposed dividend incorrectly used as paid dividend -> REJECTED (PROPOSED_DIVIDEND_NOT_PAID)
 * 5. CAPEX inferred mechanically from fixed-asset changes -> REJECTED (CAPEX_INFERRED_FROM_BALANCE_SHEET_FORBIDDEN)
 * 6. Invalid numeric values (non-finite, NaN, corrupted) -> DATA_UNAVAILABLE (VALUE_NON_FINITE)
 * 7. Unit mismatch / unverified units -> REJECTED (UNVERIFIED_UNITS)
 * 8. Period mismatch in cross-source reconciliation -> REJECTED (PERIOD_MISMATCH)
 * 9. Consolidated vs separate statements ambiguity -> REJECTED (AMBIGUOUS_CONSOLIDATION_STATUS)
 * 10. Source provenance retention -> complete 16+ field audit verification
 * 11. Cross-source conflict -> flagged with status CONFLICT or CROSS_SOURCE_CONFLICT
 * 12. Fail-closed behavior -> never null -> 0, zero synthetic fallback
 */

import { describe, it, expect } from 'vitest';
import {
  AuthoritativeDocumentPipeline,
  DocumentDiscoveryEngine,
  FinancialDocumentParser,
  CrossSourceReconciler,
  type DiscoveredFinancialDocument,
  type RawDocumentPayload,
  type StatementLineItem,
  type SecondarySourceMetric,
} from '../index.ts';

describe('Phase 19.6 — Authoritative Financial Document Pipeline', () => {
  const canonicalDoc: DiscoveredFinancialDocument = {
    documentId: 'HOSE-HPG-2024-BCTC-HN-KT',
    symbol: 'HPG',
    title: 'Báo cáo tài chính Hợp nhất Kiểm toán năm 2024 - Tập đoàn Hòa Phát',
    source: 'HOSE',
    format: 'PDF',
    url: 'https://static2.vietstock.vn/hose/HPG_BCTC_HN_KT_2024.pdf',
    publishedAt: '2025-03-15T08:30:00.000Z',
    period: 'FY_2024',
    fiscalYear: 2024,
    periodEnd: '2024-12-31',
    reportType: 'CONSOLIDATED',
    auditStatus: 'AUDITED',
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    declaredUnit: 'TRIEU_DONG',
    declaredCurrency: 'VND',
    fileSizeBytes: 4258900,
  };

  const sampleCompleteLines: StatementLineItem[] = [
    {
      code: '10',
      nameVi: 'Doanh thu thuần về bán hàng và cung cấp dịch vụ',
      nameEn: 'Net sales',
      valueRaw: '139.542.800',
      confidence: 1.0,
    },
    {
      code: '60',
      nameVi: 'Lợi nhuận sau thuế thu nhập doanh nghiệp',
      nameEn: 'Net profit after tax',
      valueRaw: '12.350.400',
      confidence: 1.0,
    },
    {
      code: '20',
      nameVi: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh',
      nameEn: 'Net cash flows from operating activities',
      valueRaw: '15.420.000',
      confidence: 1.0,
    },
    {
      code: '21',
      nameVi: 'Tiền chi để mua sắm, xây dựng TSCĐ và các TSDH khác',
      nameEn: 'Purchase of fixed assets',
      valueRaw: '(21.500.000)',
      confidence: 1.0,
    },
    {
      code: '36',
      nameVi: 'Tiền trả cổ tức, lợi nhuận cho chủ sở hữu',
      nameEn: 'Dividends paid to owners',
      valueRaw: '(1.850.000)',
      confidence: 1.0,
    },
    {
      code: '270',
      nameVi: 'Tổng cộng tài sản',
      nameEn: 'Total assets',
      valueRaw: '187.650.000',
      confidence: 1.0,
    },
    {
      code: '400',
      nameVi: 'Vốn chủ sở hữu',
      nameEn: 'Total equity',
      valueRaw: '105.200.000',
      confidence: 1.0,
    },
  ];

  // -------------------------------------------------------------------------
  // 1. Missing CFO
  // -------------------------------------------------------------------------
  it('1. Missing CFO line item results in DATA_UNAVAILABLE and REQUIRED_LINE_ITEM_NOT_FOUND', () => {
    const parser = new FinancialDocumentParser();
    // Exclude Line 20 (CFO)
    const linesWithoutCfo = sampleCompleteLines.filter((l) => l.code !== '20');

    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: linesWithoutCfo,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CFO']).toBeDefined();
    expect(metrics['CFO'].value).toBeNull();
    expect(metrics['CFO'].validationStatus).toBe('UNAVAILABLE');
    expect(metrics['CFO'].unavailableReason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
    // Ensure no fallback or zero substitution
    expect(metrics['CFO'].value).not.toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Missing CAPEX
  // -------------------------------------------------------------------------
  it('2. Missing CAPEX line item results in DATA_UNAVAILABLE and REQUIRED_LINE_ITEM_NOT_FOUND', () => {
    const parser = new FinancialDocumentParser();
    // Exclude Line 21 (CAPEX)
    const linesWithoutCapex = sampleCompleteLines.filter((l) => l.code !== '21');

    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: linesWithoutCapex,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CAPEX']).toBeDefined();
    expect(metrics['CAPEX'].value).toBeNull();
    expect(metrics['CAPEX'].validationStatus).toBe('UNAVAILABLE');
    expect(metrics['CAPEX'].unavailableReason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
    expect(metrics['CAPEX'].value).not.toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Missing actual cash dividend
  // -------------------------------------------------------------------------
  it('3. Missing actual cash dividend paid line item results in DATA_UNAVAILABLE and REQUIRED_LINE_ITEM_NOT_FOUND', () => {
    const parser = new FinancialDocumentParser();
    // Exclude Line 36 (Dividends Paid)
    const linesWithoutDividend = sampleCompleteLines.filter((l) => l.code !== '36');

    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: linesWithoutDividend,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CASH_DIVIDEND_PAID']).toBeDefined();
    expect(metrics['CASH_DIVIDEND_PAID'].value).toBeNull();
    expect(metrics['CASH_DIVIDEND_PAID'].validationStatus).toBe('UNAVAILABLE');
    expect(metrics['CASH_DIVIDEND_PAID'].unavailableReason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
    expect(metrics['CASH_DIVIDEND_PAID'].value).not.toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. Approved dividend incorrectly used as paid dividend
  // -------------------------------------------------------------------------
  it('4. Approved / proposed dividend resolution is strictly rejected from being treated as cash dividend paid', () => {
    const parser = new FinancialDocumentParser();
    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'NOTES_TO_FINANCIALS',
      lines: [
        {
          nameVi: 'Nghị quyết ĐHĐCĐ thường niên thông qua phương án chi trả cổ tức năm 2024 tỷ lệ 20% bằng tiền',
          valueRaw: '20%',
          confidence: 1.0,
        },
      ],
      declaredUnit: 'TRIEU_DONG',
      isProposedDividendOnly: true, // Resolution rather than cash flow statement
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CASH_DIVIDEND_PAID']).toBeDefined();
    expect(metrics['CASH_DIVIDEND_PAID'].value).toBeNull();
    expect(metrics['CASH_DIVIDEND_PAID'].validationStatus).toBe('REJECTED');
    expect(metrics['CASH_DIVIDEND_PAID'].unavailableReason).toBe('PROPOSED_DIVIDEND_NOT_PAID');
  });

  // -------------------------------------------------------------------------
  // 5. CAPEX inferred mechanically from fixed-asset changes
  // -------------------------------------------------------------------------
  it('5. Mechanical inference of CAPEX from balance sheet fixed asset changes is strictly forbidden and rejected', () => {
    const parser = new FinancialDocumentParser();
    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'BALANCE_SHEET',
      lines: [
        {
          code: '220',
          nameVi: 'Tài sản cố định (Chênh lệch cuối kỳ trừ đầu kỳ)',
          valueRaw: '15.000.000',
          confidence: 1.0,
        },
      ],
      declaredUnit: 'TRIEU_DONG',
      isBalanceSheetCapexInferAttempt: true,
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CAPEX']).toBeDefined();
    expect(metrics['CAPEX'].value).toBeNull();
    expect(metrics['CAPEX'].validationStatus).toBe('REJECTED');
    expect(metrics['CAPEX'].unavailableReason).toBe('CAPEX_INFERRED_FROM_BALANCE_SHEET_FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // 6. Invalid numeric values
  // -------------------------------------------------------------------------
  it('6. Invalid numeric values (NaN, corrupted text, non-finite) fail closed with VALUE_NON_FINITE', () => {
    const parser = new FinancialDocumentParser();
    const corruptedLines: StatementLineItem[] = [
      {
        code: '20',
        nameVi: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh',
        valueRaw: 'CORRUPTED_TEXT_#ERR',
        confidence: 0.9,
      },
      {
        code: '21',
        nameVi: 'Tiền chi để mua sắm, xây dựng TSCĐ',
        valueRaw: 'N/A',
        confidence: 0.9,
      },
    ];

    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: corruptedLines,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CFO'].value).toBeNull();
    expect(metrics['CFO'].unavailableReason).toBe('VALUE_NON_FINITE');
    expect(metrics['CAPEX'].value).toBeNull();
    expect(metrics['CAPEX'].unavailableReason).toBe('VALUE_NON_FINITE');
  });

  // -------------------------------------------------------------------------
  // 7. Unit mismatch / unverified units
  // -------------------------------------------------------------------------
  it('7. Unverified or unrecognized units fail closed with UNVERIFIED_UNITS', () => {
    const parser = new FinancialDocumentParser();
    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: sampleCompleteLines,
      declaredUnit: 'UNKNOWN_CUSTOM_CURRENCY_TOKEN_xyz', // Unrecognized unit
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CFO'].value).toBeNull();
    expect(metrics['CFO'].validationStatus).toBe('REJECTED');
    expect(metrics['CFO'].unavailableReason).toBe('UNVERIFIED_UNITS');
    expect(metrics['CAPEX'].value).toBeNull();
    expect(metrics['CAPEX'].unavailableReason).toBe('UNVERIFIED_UNITS');
  });

  // -------------------------------------------------------------------------
  // 8. Period mismatch in cross-source reconciliation
  // -------------------------------------------------------------------------
  it('8. Cross-source period mismatch between primary and secondary source is rejected with PERIOD_MISMATCH', () => {
    const reconciler = new CrossSourceReconciler();

    const primaryMetric = {
      symbol: 'HPG',
      metric: 'CFO',
      value: 15420000000000, // 15,420 billion VND
      currency: 'VND',
      unit: 'VND',
      period: 'FY_2024',
      periodEnd: '2024-12-31',
      statementType: 'CASH_FLOW_INDIRECT' as const,
      reportType: 'CONSOLIDATED' as const,
      audited: true,
      sourceUrl: canonicalDoc.url,
      sourceDocumentId: canonicalDoc.documentId,
      sourcePublishedAt: canonicalDoc.publishedAt,
      extractedAt: new Date().toISOString(),
      extractionMethod: 'NATIVE_TABLE_PARSER' as const,
      confidence: 1.0,
      validationStatus: 'VALIDATED' as const,
    };

    const secondaryWrongPeriod: SecondarySourceMetric[] = [
      {
        source: 'VPS',
        symbol: 'HPG',
        metric: 'CFO',
        period: 'Q3_2024', // Mismatched period!
        value: 15420000000000,
        unit: 'VND',
        asOf: '2024-09-30',
      },
    ];

    const result = reconciler.reconcileMetric(primaryMetric, secondaryWrongPeriod);
    expect(result.isReconciled).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.reasonCode).toBe('PERIOD_MISMATCH');
    expect(result.primaryMetric.value).toBeNull();
    expect(result.primaryMetric.unavailableReason).toBe('PERIOD_MISMATCH');
  });

  // -------------------------------------------------------------------------
  // 9. Consolidated vs separate statements
  // -------------------------------------------------------------------------
  it('9. Ambiguous or conflicted consolidated/separate statement filing is rejected with AMBIGUOUS_CONSOLIDATION_STATUS', () => {
    const ambiguousDoc: DiscoveredFinancialDocument = {
      ...canonicalDoc,
      title: 'BCTC Hợp nhất và Riêng lẻ năm 2024',
      // Explicitly set ambiguous report type
      reportType: '' as any,
    };

    const parser = new FinancialDocumentParser();
    const payload: RawDocumentPayload = {
      document: ambiguousDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: sampleCompleteLines,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    expect(metrics['CFO'].value).toBeNull();
    expect(metrics['CFO'].validationStatus).toBe('REJECTED');
    expect(metrics['CFO'].unavailableReason).toBe('AMBIGUOUS_CONSOLIDATION_STATUS');
  });

  // -------------------------------------------------------------------------
  // 10. Source provenance retention
  // -------------------------------------------------------------------------
  it('10. Every extracted metric retains all 16+ required provenance fields with zero loss', () => {
    const parser = new FinancialDocumentParser();
    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: sampleCompleteLines,
      declaredUnit: 'TRIEU_DONG',
    };

    const metrics = parser.extractMetrics(payload);
    const cfo = metrics['CFO'];
    expect(cfo).toBeDefined();

    // Check all required data contract properties from the specification
    expect(cfo.symbol).toBe('HPG');
    expect(cfo.metric).toBe('CFO');
    expect(cfo.value).toBe(15_420_000 * 1_000_000); // 15,420,000 million VND = 15.42 trillion VND
    expect(cfo.currency).toBe('VND');
    expect(cfo.unit).toBe('VND');
    expect(cfo.period).toBe('FY_2024');
    expect(cfo.periodEnd).toBe('2024-12-31');
    expect(cfo.statementType).toBe('CASH_FLOW_INDIRECT');
    expect(cfo.reportType).toBe('CONSOLIDATED');
    expect(cfo.audited).toBe(true);
    expect(cfo.sourceUrl).toBe(canonicalDoc.url);
    expect(cfo.sourceDocumentId).toBe(canonicalDoc.documentId);
    expect(cfo.sourcePublishedAt).toBe(canonicalDoc.publishedAt);
    expect(cfo.extractedAt).toBeDefined();
    expect(cfo.extractionMethod).toBe('NATIVE_TABLE_PARSER');
    expect(cfo.confidence).toBe(1.0);
    expect(cfo.validationStatus).toBe('VALIDATED');

    // Also verify CAPEX and Dividend
    const capex = metrics['CAPEX'];
    expect(capex.value).toBe(21_500_000 * 1_000_000);
    expect(capex.validationStatus).toBe('VALIDATED');

    const div = metrics['CASH_DIVIDEND_PAID'];
    expect(div.value).toBe(1_850_000 * 1_000_000);
    expect(div.validationStatus).toBe('VALIDATED');
  });

  // -------------------------------------------------------------------------
  // 11. Cross-source conflict
  // -------------------------------------------------------------------------
  it('11. Material cross-source discrepancy exceeding tolerance is flagged as CONFLICT', () => {
    const reconciler = new CrossSourceReconciler({ maxDivergencePercent: 1.0 });

    const primaryMetric = {
      symbol: 'HPG',
      metric: 'CFO',
      value: 15_420_000_000_000,
      currency: 'VND',
      unit: 'VND',
      period: 'FY_2024',
      periodEnd: '2024-12-31',
      statementType: 'CASH_FLOW_INDIRECT' as const,
      reportType: 'CONSOLIDATED' as const,
      audited: true,
      sourceUrl: canonicalDoc.url,
      sourceDocumentId: canonicalDoc.documentId,
      sourcePublishedAt: canonicalDoc.publishedAt,
      extractedAt: new Date().toISOString(),
      extractionMethod: 'NATIVE_TABLE_PARSER' as const,
      confidence: 1.0,
      validationStatus: 'VALIDATED' as const,
    };

    const conflictingSecondaries: SecondarySourceMetric[] = [
      {
        source: 'KBS',
        symbol: 'HPG',
        metric: 'CFO',
        period: 'FY_2024',
        value: 12_000_000_000_000, // Significant discrepancy: ~22% divergence!
        unit: 'VND',
        asOf: '2024-12-31',
      },
    ];

    const result = reconciler.reconcileMetric(primaryMetric, conflictingSecondaries);
    expect(result.isReconciled).toBe(false);
    expect(result.status).toBe('CONFLICT');
    expect(result.reasonCode).toBe('CROSS_SOURCE_CONFLICT');
    expect(result.divergencePercent).toBeGreaterThan(1.0);
    expect(result.primaryMetric.validationStatus).toBe('CONFLICT');
  });

  // -------------------------------------------------------------------------
  // 12. Fail-closed behavior & End-to-End Pipeline Execution
  // -------------------------------------------------------------------------
  it('12. End-to-end pipeline enforces fail-closed behavior when document is absent', () => {
    const discoveryEngine = new DocumentDiscoveryEngine();
    // Do not register any document for ticker XYZ
    const pipeline = new AuthoritativeDocumentPipeline(discoveryEngine);

    const result = pipeline.execute({
      discoveryQuery: {
        symbol: 'XYZ',
        period: 'FY_2024',
        fiscalYear: 2024,
      },
    });

    expect(result.pipelineStatus).toBe('FAILED');
    expect(result.document.documentId).toBe('DOC_NOT_FOUND');
    expect(result.metrics['CFO'].value).toBeNull();
    expect(result.metrics['CFO'].unavailableReason).toBe('MISSING_SOURCE_DOCUMENT');
    expect(result.metrics['CAPEX'].value).toBeNull();
    expect(result.metrics['CAPEX'].unavailableReason).toBe('MISSING_SOURCE_DOCUMENT');
    expect(result.metrics['CASH_DIVIDEND_PAID'].value).toBeNull();
    expect(result.metrics['CASH_DIVIDEND_PAID'].unavailableReason).toBe('MISSING_SOURCE_DOCUMENT');
    // Invariant: null is never converted to 0
    expect(result.metrics['CFO'].value).not.toBe(0);
  });

  it('13. Successful End-to-End Pipeline execution with document discovery, extraction, and reconciliation', () => {
    const discoveryEngine = new DocumentDiscoveryEngine([canonicalDoc]);
    const reconciler = new CrossSourceReconciler({ maxDivergencePercent: 2.0 });
    const pipeline = new AuthoritativeDocumentPipeline(discoveryEngine, undefined, reconciler);

    const secondaryFeeds: Record<string, SecondarySourceMetric[]> = {
      CFO: [
        {
          source: 'VPS',
          symbol: 'HPG',
          metric: 'CFO',
          period: 'FY_2024',
          value: 15_420_000_000_000,
          unit: 'VND',
          asOf: '2024-12-31',
        },
      ],
      CAPEX: [
        {
          source: 'KBS',
          symbol: 'HPG',
          metric: 'CAPEX',
          period: 'FY_2024',
          value: 21_500_000_000_000,
          unit: 'VND',
          asOf: '2024-12-31',
        },
      ],
      CASH_DIVIDEND_PAID: [
        {
          source: 'VNDIRECT',
          symbol: 'HPG',
          metric: 'CASH_DIVIDEND_PAID',
          period: 'FY_2024',
          value: 1_850_000_000_000,
          unit: 'VND',
          asOf: '2024-12-31',
        },
      ],
    };

    const payload: RawDocumentPayload = {
      document: canonicalDoc,
      statementType: 'CASH_FLOW_INDIRECT',
      lines: sampleCompleteLines,
      declaredUnit: 'TRIEU_DONG',
    };

    const result = pipeline.execute({
      discoveryQuery: {
        symbol: 'HPG',
        period: 'FY_2024',
        fiscalYear: 2024,
      },
      rawPayload: payload,
      secondarySources: secondaryFeeds,
    });

    expect(result.pipelineStatus).toBe('SUCCESS');
    expect(result.metrics['CFO'].validationStatus).toBe('RECONCILED');
    expect(result.metrics['CFO'].value).toBe(15_420_000_000_000);
    expect(result.metrics['CAPEX'].validationStatus).toBe('RECONCILED');
    expect(result.metrics['CAPEX'].value).toBe(21_500_000_000_000);
    expect(result.metrics['CASH_DIVIDEND_PAID'].validationStatus).toBe('RECONCILED');
    expect(result.metrics['CASH_DIVIDEND_PAID'].value).toBe(1_850_000_000_000);
  });
});
