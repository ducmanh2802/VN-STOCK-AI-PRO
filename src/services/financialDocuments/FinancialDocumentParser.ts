/**
 * PHASE 19.6 — AUTHORITATIVE FINANCIAL DOCUMENT PARSER & EXTRACTOR
 * ===============================================================
 * Extracts line items from authoritative Vietnamese financial statements
 * with rigorous accounting line matching, unit normalization, and fail-closed guards.
 * 
 * Strict Invariants:
 * 1. Zero tolerance for synthetic data or null -> 0 conversion.
 * 2. Missing CFO/CAPEX/Dividend must remain DATA_UNAVAILABLE.
 * 3. Never infer CAPEX from fixed-asset changes.
 * 4. Never treat proposed/approved dividends as cash dividends paid.
 * 5. Retains full source provenance and audit metadata.
 */

import type {
  DiscoveredFinancialDocument,
  ExtractedFinancialMetric,
  FinancialStatementType,
  FinancialReportType,
  StatementLineItem,
  ExtractionMethod,
  DataUnavailableReasonCode,
} from './types.ts';

export interface RawDocumentPayload {
  document: DiscoveredFinancialDocument;
  statementType: FinancialStatementType;
  lines: StatementLineItem[];
  declaredUnit?: string;          // e.g. 'VND', 'TRIEU_DONG', 'TY_DONG', 'NGHIN_DONG'
  declaredCurrency?: string;      // e.g. 'VND'
  extractionMethod?: ExtractionMethod;
  extractionConfidence?: number;  // 0.0 - 1.0
  isProposedDividendOnly?: boolean; // Flag if input represents a resolution rather than cash flow
  isBalanceSheetCapexInferAttempt?: boolean; // Flag if input tries to infer CAPEX from balance sheet
}

export class FinancialDocumentParser {
  /**
   * Unit multiplier mapping for Vietnamese financial filings.
   */
  private static readonly UNIT_MULTIPLIERS: Record<string, number> = {
    VND: 1,
    DONG: 1,
    NGHIN_DONG: 1_000,
    NGAN_DONG: 1_000,
    TRIEU_DONG: 1_000_000,
    TY_DONG: 1_000_000_000,
  };

  /**
   * Parse a raw numeric value string from financial tables, taking into account
   * Vietnamese accounting formatting:
   * - Parenthesized negatives: (123.456) or (123,456) -> negative
   * - Decimal points and comma thousands separators
   * - Dashes or empty cells -> null
   */
  public static parseNumericCell(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null;
    }

    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '—' || trimmed === 'N/A') {
      return null;
    }

    // Check parenthesized negative: (123.456) or ( 123,456 )
    const isParenthesized = /^\s*\((.*)\)\s*$/.test(trimmed);
    let cleaned = isParenthesized ? trimmed.replace(/^\s*\((.*)\)\s*$/, '$1') : trimmed;

    // Handle Vietnamese accounting standard where dot (.) or comma (,) separates thousands
    // E.g. "1.234.567" or "1,234,567"
    // Check if contains both dot and comma
    if (cleaned.includes('.') && cleaned.includes(',')) {
      const lastDot = cleaned.lastIndexOf('.');
      const lastComma = cleaned.lastIndexOf(',');
      if (lastDot > lastComma) {
        // Comma is thousands, dot is decimal (US style)
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // Dot is thousands, comma is decimal (VN style)
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleaned.includes('.')) {
      // Multiple dots -> thousands separators e.g. "1.234.567"
      const dots = (cleaned.match(/\./g) || []).length;
      if (dots > 1) {
        cleaned = cleaned.replace(/\./g, '');
      } else {
        // Single dot: if followed by exactly 3 digits and no more, in Vietnamese statements it's thousands!
        // But if followed by 1 or 2 digits, it's decimal.
        const parts = cleaned.split('.');
        if (parts[1] && parts[1].length === 3) {
          cleaned = parts[0] + parts[1];
        }
      }
    } else if (cleaned.includes(',')) {
      // Multiple commas -> thousands separators
      const commas = (cleaned.match(/,/g) || []).length;
      if (commas > 1) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        const parts = cleaned.split(',');
        if (parts[1] && parts[1].length === 3) {
          cleaned = parts[0] + parts[1];
        } else {
          cleaned = cleaned.replace(',', '.');
        }
      }
    }

    // Strip spaces
    cleaned = cleaned.replace(/\s+/g, '');

    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return isParenthesized ? -parsed : parsed;
  }

  /**
   * Resolves the canonical unit multiplier from declared unit string.
   */
  public static resolveUnitMultiplier(unitStr?: string): { multiplier: number; canonicalUnit: string } | null {
    if (!unitStr) return null;
    const normalized = unitStr.toUpperCase().trim().replace(/[\s\-_]+/g, '_');

    if (normalized.includes('TY') || normalized.includes('BILLION')) {
      return { multiplier: 1_000_000_000, canonicalUnit: 'VND' };
    }
    if (normalized.includes('TRIEU') || normalized.includes('MILLION')) {
      return { multiplier: 1_000_000, canonicalUnit: 'VND' };
    }
    if (normalized.includes('NGHIN') || normalized.includes('NGAN') || normalized.includes('THOUSAND')) {
      return { multiplier: 1_000, canonicalUnit: 'VND' };
    }
    if (normalized.includes('VND') || normalized.includes('DONG')) {
      return { multiplier: 1, canonicalUnit: 'VND' };
    }

    return null;
  }

  /**
   * Main extractor: extracts all required financial metrics from a parsed raw document.
   */
  public extractMetrics(payload: RawDocumentPayload): Record<string, ExtractedFinancialMetric> {
    const doc = payload.document;
    const now = new Date().toISOString();
    const results: Record<string, ExtractedFinancialMetric> = {};

    // 1. Validate Document Integrity
    const isAmbiguousConsolidation = !doc.reportType || (doc.reportType !== 'CONSOLIDATED' && doc.reportType !== 'SEPARATE');
    const unitResolution = FinancialDocumentParser.resolveUnitMultiplier(payload.declaredUnit ?? doc.declaredUnit);

    // Helper to generate a metric entry adhering strictly to the contract
    const buildMetric = (
      metricKey: string,
      value: number | null,
      statementType: FinancialStatementType,
      reasonCode?: DataUnavailableReasonCode,
      notes?: string,
      overrideConfidence?: number
    ): ExtractedFinancialMetric => {
      const isAudited = doc.auditStatus === 'AUDITED';
      const confidence = overrideConfidence ?? payload.extractionConfidence ?? 1.0;
      let validationStatus: ExtractedFinancialMetric['validationStatus'] = 'VALIDATED';

      if (reasonCode) {
        if (
          reasonCode === 'REQUIRED_LINE_ITEM_NOT_FOUND' ||
          reasonCode === 'MISSING_SOURCE_DOCUMENT' ||
          reasonCode === 'VALUE_NON_FINITE'
        ) {
          validationStatus = 'UNAVAILABLE';
        } else {
          validationStatus = 'REJECTED';
        }
      } else if (value === null || !Number.isFinite(value)) {
        validationStatus = 'UNAVAILABLE';
      }

      return {
        symbol: doc.symbol,
        metric: metricKey,
        value,
        currency: 'VND',
        unit: 'VND',
        period: doc.period,
        periodEnd: doc.periodEnd,
        statementType,
        reportType: doc.reportType,
        audited: isAudited,
        sourceUrl: doc.url,
        sourceDocumentId: doc.documentId,
        sourcePublishedAt: doc.publishedAt,
        extractedAt: now,
        extractionMethod: payload.extractionMethod ?? 'NATIVE_TABLE_PARSER',
        confidence,
        validationStatus,
        unavailableReason: reasonCode,
        notes,
      };
    };

    // Check for Ambiguous Consolidation Status
    if (isAmbiguousConsolidation) {
      const unavailableReason: DataUnavailableReasonCode = 'AMBIGUOUS_CONSOLIDATION_STATUS';
      results['CFO'] = buildMetric('CFO', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Consolidation status cannot be unambiguously verified.');
      results['CAPEX'] = buildMetric('CAPEX', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Consolidation status cannot be unambiguously verified.');
      results['CASH_DIVIDEND_PAID'] = buildMetric('CASH_DIVIDEND_PAID', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Consolidation status cannot be unambiguously verified.');
      return results;
    }

    // Check for Unverified Units
    if (!unitResolution) {
      const unavailableReason: DataUnavailableReasonCode = 'UNVERIFIED_UNITS';
      results['CFO'] = buildMetric('CFO', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Document unit could not be authoritatively verified.');
      results['CAPEX'] = buildMetric('CAPEX', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Document unit could not be authoritatively verified.');
      results['CASH_DIVIDEND_PAID'] = buildMetric('CASH_DIVIDEND_PAID', null, 'CASH_FLOW_INDIRECT', unavailableReason, 'Document unit could not be authoritatively verified.');
      return results;
    }

    // Check for Low OCR / Parser Confidence (< 0.6)
    if (payload.extractionConfidence !== undefined && payload.extractionConfidence < 0.6) {
      const unavailableReason: DataUnavailableReasonCode = 'LOW_EXTRACTION_CONFIDENCE';
      results['CFO'] = buildMetric('CFO', null, 'CASH_FLOW_INDIRECT', unavailableReason, `Extraction confidence ${payload.extractionConfidence} below threshold (0.60).`);
      results['CAPEX'] = buildMetric('CAPEX', null, 'CASH_FLOW_INDIRECT', unavailableReason, `Extraction confidence ${payload.extractionConfidence} below threshold (0.60).`);
      results['CASH_DIVIDEND_PAID'] = buildMetric('CASH_DIVIDEND_PAID', null, 'CASH_FLOW_INDIRECT', unavailableReason, `Extraction confidence ${payload.extractionConfidence} below threshold (0.60).`);
      return results;
    }

    const { multiplier } = unitResolution;

    // -----------------------------------------------------------------------
    // A. CFO (Operating Cash Flow) Extraction
    // Target VAS Code 20: "Lưu chuyển tiền thuần từ hoạt động kinh doanh"
    // -----------------------------------------------------------------------
    const cfoLine = this.findLineItem(payload.lines, [
      { code: '20' },
      { nameViRegex: /(lưu chuyển tiền thuần từ hoạt động kinh doanh|lưu chuyển tiền thuần trong kỳ từ hđkd)/i },
      { nameEnRegex: /(net cash flows? (from|used in) operating activities)/i },
    ]);

    if (!cfoLine) {
      results['CFO'] = buildMetric(
        'CFO',
        null,
        'CASH_FLOW_INDIRECT',
        'REQUIRED_LINE_ITEM_NOT_FOUND',
        'Operating Cash Flow line item (Code 20) was not found in disclosure document.'
      );
    } else {
      const parsedNum = FinancialDocumentParser.parseNumericCell(cfoLine.valueRaw);
      if (parsedNum === null || !Number.isFinite(parsedNum)) {
        results['CFO'] = buildMetric(
          'CFO',
          null,
          'CASH_FLOW_INDIRECT',
          'VALUE_NON_FINITE',
          `CFO raw value '${cfoLine.valueRaw}' is non-finite or unparseable.`
        );
      } else {
        results['CFO'] = buildMetric(
          'CFO',
          parsedNum * multiplier,
          'CASH_FLOW_INDIRECT',
          undefined,
          `Extracted from Line 20: ${cfoLine.nameVi}`
        );
      }
    }

    // -----------------------------------------------------------------------
    // B. CAPEX (Capital Expenditure) Extraction
    // Target VAS Code 21 in Investing Cash Flows:
    // "Tiền chi để mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác"
    // CRITICAL: Do NOT infer CAPEX mechanically from fixed-asset changes!
    // -----------------------------------------------------------------------
    if (payload.isBalanceSheetCapexInferAttempt) {
      results['CAPEX'] = buildMetric(
        'CAPEX',
        null,
        'BALANCE_SHEET',
        'CAPEX_INFERRED_FROM_BALANCE_SHEET_FORBIDDEN',
        'Mechanical inference of CAPEX from balance sheet fixed asset changes is strictly forbidden.'
      );
    } else {
      const capexLine = this.findLineItem(payload.lines, [
        { code: '21' },
        { nameViRegex: /(tiền chi để mua sắm,? xây dựng tscđ|tiền chi mua sắm tscđ)/i },
        { nameEnRegex: /(purchase of (fixed assets|property,? plant and equipment))/i },
      ]);

      if (!capexLine) {
        results['CAPEX'] = buildMetric(
          'CAPEX',
          null,
          'CASH_FLOW_INDIRECT',
          'REQUIRED_LINE_ITEM_NOT_FOUND',
          'CAPEX line item (Code 21 in cash flow statement) was not found in disclosure document.'
        );
      } else {
        const parsedNum = FinancialDocumentParser.parseNumericCell(capexLine.valueRaw);
        if (parsedNum === null || !Number.isFinite(parsedNum)) {
          results['CAPEX'] = buildMetric(
            'CAPEX',
            null,
            'CASH_FLOW_INDIRECT',
            'VALUE_NON_FINITE',
            `CAPEX raw value '${capexLine.valueRaw}' is non-finite or unparseable.`
          );
        } else {
          // CAPEX is cash outflow; standardize magnitude as positive number (outflow magnitude)
          const canonicalCapex = Math.abs(parsedNum * multiplier);
          results['CAPEX'] = buildMetric(
            'CAPEX',
            canonicalCapex,
            'CASH_FLOW_INDIRECT',
            undefined,
            `Extracted from Line 21: ${capexLine.nameVi}`
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // C. CASH DIVIDEND ACTUALLY PAID Extraction
    // Target VAS Code 36 in Financing Cash Flows:
    // "Tiền trả cổ tức, lợi nhuận cho chủ sở hữu"
    // CRITICAL: Do NOT treat approved/proposed dividends as cash dividends actually paid!
    // -----------------------------------------------------------------------
    if (payload.isProposedDividendOnly) {
      results['CASH_DIVIDEND_PAID'] = buildMetric(
        'CASH_DIVIDEND_PAID',
        null,
        'NOTES_TO_FINANCIALS',
        'PROPOSED_DIVIDEND_NOT_PAID',
        'Proposed / approved dividend resolution cannot be treated as actual cash dividend paid.'
      );
    } else {
      const divLine = this.findLineItem(payload.lines, [
        { code: '36' },
        { nameViRegex: /(tiền trả cổ tức,? lợi nhuận cho chủ sở hữu|cổ tức,? lợi nhuận đã trả cho chủ sở hữu)/i },
        { nameEnRegex: /(dividends (and profits )?paid to (owners|shareholders))/i },
      ]);

      if (!divLine) {
        results['CASH_DIVIDEND_PAID'] = buildMetric(
          'CASH_DIVIDEND_PAID',
          null,
          'CASH_FLOW_INDIRECT',
          'REQUIRED_LINE_ITEM_NOT_FOUND',
          'Cash Dividend Paid line item (Code 36 in cash flow statement) was not found in disclosure document.'
        );
      } else {
        const parsedNum = FinancialDocumentParser.parseNumericCell(divLine.valueRaw);
        if (parsedNum === null || !Number.isFinite(parsedNum)) {
          results['CASH_DIVIDEND_PAID'] = buildMetric(
            'CASH_DIVIDEND_PAID',
            null,
            'CASH_FLOW_INDIRECT',
            'VALUE_NON_FINITE',
            `Cash dividend raw value '${divLine.valueRaw}' is non-finite or unparseable.`
          );
        } else {
          // Cash dividend paid is a financing cash outflow; standardize magnitude
          const canonicalDiv = Math.abs(parsedNum * multiplier);
          results['CASH_DIVIDEND_PAID'] = buildMetric(
            'CASH_DIVIDEND_PAID',
            canonicalDiv,
            'CASH_FLOW_INDIRECT',
            undefined,
            `Extracted from Line 36: ${divLine.nameVi}`
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // D. Additional Core Authoritative Statement Line Items
    // -----------------------------------------------------------------------

    // 1. Net Revenue (VAS Code 10)
    const revLine = this.findLineItem(payload.lines, [
      { code: '10' },
      { nameViRegex: /(doanh thu thuần về bán hàng và cung cấp dịch vụ|doanh thu thuần)/i },
      { nameEnRegex: /(net revenue|net sales)/i },
    ]);
    if (revLine) {
      const parsedNum = FinancialDocumentParser.parseNumericCell(revLine.valueRaw);
      if (parsedNum !== null && Number.isFinite(parsedNum)) {
        results['NET_REVENUE'] = buildMetric(
          'NET_REVENUE',
          parsedNum * multiplier,
          'INCOME_STATEMENT',
          undefined,
          `Extracted from Line 10: ${revLine.nameVi}`
        );
      }
    }

    // 2. Net Profit After Tax (VAS Code 60)
    const npLine = this.findLineItem(payload.lines, [
      { code: '60' },
      { nameViRegex: /(lợi nhuận sau thuế thu nhập doanh nghiệp|lợi nhuận sau thuế)/i },
      { nameEnRegex: /(net profit after tax|profit after tax)/i },
    ]);
    if (npLine) {
      const parsedNum = FinancialDocumentParser.parseNumericCell(npLine.valueRaw);
      if (parsedNum !== null && Number.isFinite(parsedNum)) {
        results['NET_PROFIT'] = buildMetric(
          'NET_PROFIT',
          parsedNum * multiplier,
          'INCOME_STATEMENT',
          undefined,
          `Extracted from Line 60: ${npLine.nameVi}`
        );
      }
    }

    // 3. Total Assets (VAS Code 270)
    const taLine = this.findLineItem(payload.lines, [
      { code: '270' },
      { nameViRegex: /(tổng cộng tài sản|tổng tài sản)/i },
      { nameEnRegex: /(total assets)/i },
    ]);
    if (taLine) {
      const parsedNum = FinancialDocumentParser.parseNumericCell(taLine.valueRaw);
      if (parsedNum !== null && Number.isFinite(parsedNum)) {
        results['TOTAL_ASSETS'] = buildMetric(
          'TOTAL_ASSETS',
          parsedNum * multiplier,
          'BALANCE_SHEET',
          undefined,
          `Extracted from Line 270: ${taLine.nameVi}`
        );
      }
    }

    // 4. Total Equity (VAS Code 400)
    const teLine = this.findLineItem(payload.lines, [
      { code: '400' },
      { nameViRegex: /(vốn chủ sở hữu)/i },
      { nameEnRegex: /(total equity|owners'? equity)/i },
    ]);
    if (teLine) {
      const parsedNum = FinancialDocumentParser.parseNumericCell(teLine.valueRaw);
      if (parsedNum !== null && Number.isFinite(parsedNum)) {
        results['TOTAL_EQUITY'] = buildMetric(
          'TOTAL_EQUITY',
          parsedNum * multiplier,
          'BALANCE_SHEET',
          undefined,
          `Extracted from Line 400: ${teLine.nameVi}`
        );
      }
    }

    return results;
  }

  /**
   * Helper to locate statement line item by code or regex patterns.
   */
  private findLineItem(
    lines: StatementLineItem[],
    matchers: Array<{ code?: string; nameViRegex?: RegExp; nameEnRegex?: RegExp }>
  ): StatementLineItem | null {
    for (const matcher of matchers) {
      for (const line of lines) {
        if (matcher.code && line.code && line.code.trim() === matcher.code) {
          return line;
        }
        if (matcher.nameViRegex && matcher.nameViRegex.test(line.nameVi)) {
          return line;
        }
        if (matcher.nameEnRegex && line.nameEn && matcher.nameEnRegex.test(line.nameEn)) {
          return line;
        }
      }
    }
    return null;
  }
}
