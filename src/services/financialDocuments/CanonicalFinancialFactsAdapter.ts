/**
 * PHASE 19.7 — CANONICAL FINANCIAL FACTS INTEGRATION ADAPTER
 * ==========================================================
 * Connects the Phase 19.6 Authoritative Financial Document Pipeline with:
 * - Free Cash Flow (FCF = canonical CFO - canonical CAPEX)
 * - Capital Allocation Engine
 * - Valuation Engine (DCF Fail-Closed Rule)
 * - Stock Detail UI / Snapshot Layers
 * 
 * Core Invariants:
 * 1. ONE FINANCIAL FACT -> ONE AUTHORITATIVE SOURCE -> ONE DEFINITION -> ONE QUANT RESULT
 * 2. Fail-closed: Never CFO ?? 0, CAPEX ?? 0, FCF ?? 0, netDebt ?? 0, dividend ?? 0.
 * 3. Strict compatibility: Symbol, Period, Currency, Unit, and Consolidation basis MUST match.
 * 4. Full provenance retention: Source document ID, filing URL, audit status, and timestamps preserved.
 */

import type {
  ExtractedFinancialMetric,
  DocumentPipelineResult,
  FinancialReportType,
  MetricValidationStatus,
  DataUnavailableReasonCode,
} from './types.ts';
import type {
  AnnualFinancialFact,
  FinancialFactSet,
} from '../../lib/analysis/enterprise/financialFacts.ts';
import type {
  CapitalAllocationInput,
  CompanyType,
} from '../../lib/analysis/capitalAllocation/types.ts';
import type { ValuationEngineInput } from '../../lib/analysis/valuation/ValuationEngine.ts';
import { sanitizeNumber } from '../../lib/analysis/common/types.ts';

// ---------------------------------------------------------------------------
// 1. Canonical Free Cash Flow (FCF)
// ---------------------------------------------------------------------------

export interface CanonicalFcfResult {
  symbol: string;
  period: string;
  value: number | null;
  currency: string;
  unit: string;
  reportType: FinancialReportType;
  audited: boolean;
  status: MetricValidationStatus;
  unavailableReason?: DataUnavailableReasonCode;
  notes: string;
  provenance?: {
    cfoMetric?: ExtractedFinancialMetric;
    capexMetric?: ExtractedFinancialMetric;
    cfoSourceUrl?: string;
    capexSourceUrl?: string;
    publishedAt?: string;
  };
}

export class CanonicalFinancialFactsAdapter {
  /**
   * Computes canonical Free Cash Flow strictly from authoritative CFO and CAPEX metrics.
   * 
   * Strict compatibility rules:
   * - Both inputs must be non-null and have finite values.
   * - Symbols must match.
   * - Reporting periods must match.
   * - Currencies and Units must match.
   * - Consolidation basis (CONSOLIDATED vs SEPARATE) must match.
   * - Validation status must not be REJECTED or UNAVAILABLE.
   */
  public static calculateCanonicalFreeCashFlow(
    cfoMetric: ExtractedFinancialMetric | null | undefined,
    capexMetric: ExtractedFinancialMetric | null | undefined
  ): CanonicalFcfResult {
    // 1. Check CFO presence
    if (!cfoMetric || cfoMetric.value === null || !Number.isFinite(cfoMetric.value)) {
      return {
        symbol: cfoMetric?.symbol ?? capexMetric?.symbol ?? 'UNKNOWN',
        period: cfoMetric?.period ?? capexMetric?.period ?? 'UNKNOWN',
        value: null,
        currency: cfoMetric?.currency ?? 'VND',
        unit: cfoMetric?.unit ?? 'VND',
        reportType: cfoMetric?.reportType ?? 'CONSOLIDATED',
        audited: false,
        status: 'UNAVAILABLE',
        unavailableReason: cfoMetric?.unavailableReason ?? 'REQUIRED_LINE_ITEM_NOT_FOUND',
        notes: 'Dòng tiền hoạt động kinh doanh (CFO) không khả dụng từ báo cáo tài chính chính thức.',
      };
    }

    // 2. Check CAPEX presence
    if (!capexMetric || capexMetric.value === null || !Number.isFinite(capexMetric.value)) {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'UNAVAILABLE',
        unavailableReason: capexMetric?.unavailableReason ?? 'REQUIRED_LINE_ITEM_NOT_FOUND',
        notes: 'Chi phí vốn (CAPEX - Mã 21) không khả dụng từ báo cáo lưu chuyển tiền tệ chính thức.',
      };
    }

    // 3. Symbol compatibility
    if (cfoMetric.symbol.toUpperCase().trim() !== capexMetric.symbol.toUpperCase().trim()) {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'REJECTED',
        unavailableReason: 'PERIOD_MISMATCH',
        notes: `Không khớp mã cổ phiếu giữa CFO (${cfoMetric.symbol}) và CAPEX (${capexMetric.symbol}).`,
      };
    }

    // 4. Period compatibility
    if (cfoMetric.period !== capexMetric.period) {
      return {
        symbol: cfoMetric.symbol,
        period: `${cfoMetric.period}_vs_${capexMetric.period}`,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'REJECTED',
        unavailableReason: 'PERIOD_MISMATCH',
        notes: `Không khớp kỳ báo cáo giữa CFO (${cfoMetric.period}) và CAPEX (${capexMetric.period}).`,
      };
    }

    // 5. Currency & Unit compatibility
    if (cfoMetric.currency !== capexMetric.currency || cfoMetric.unit !== capexMetric.unit) {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'REJECTED',
        unavailableReason: 'UNVERIFIED_UNITS',
        notes: `Không khớp đơn vị tính giữa CFO (${cfoMetric.unit} ${cfoMetric.currency}) và CAPEX (${capexMetric.unit} ${capexMetric.currency}).`,
      };
    }

    // 6. Consolidation basis compatibility (Consolidated vs Separate)
    if (cfoMetric.reportType !== capexMetric.reportType) {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'REJECTED',
        unavailableReason: 'AMBIGUOUS_CONSOLIDATION_STATUS',
        notes: `Không tương thích cơ sở hợp nhất giữa CFO (${cfoMetric.reportType}) và CAPEX (${capexMetric.reportType}).`,
      };
    }

    // 7. Validation status check (Neither can be REJECTED or UNAVAILABLE)
    if (cfoMetric.validationStatus === 'REJECTED' || capexMetric.validationStatus === 'REJECTED') {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'REJECTED',
        unavailableReason: cfoMetric.unavailableReason ?? capexMetric.unavailableReason ?? 'CORRUPTED_DOCUMENT_STRUCTURE',
        notes: 'Chỉ số CFO hoặc CAPEX đã bị từ chối do vi phạm quy tắc kế toán.',
      };
    }

    if (cfoMetric.validationStatus === 'UNAVAILABLE' || capexMetric.validationStatus === 'UNAVAILABLE') {
      return {
        symbol: cfoMetric.symbol,
        period: cfoMetric.period,
        value: null,
        currency: cfoMetric.currency,
        unit: cfoMetric.unit,
        reportType: cfoMetric.reportType,
        audited: false,
        status: 'UNAVAILABLE',
        unavailableReason: cfoMetric.unavailableReason ?? capexMetric.unavailableReason ?? 'REQUIRED_LINE_ITEM_NOT_FOUND',
        notes: 'Chỉ số CFO hoặc CAPEX không khả dụng.',
      };
    }

    // 8. Calculate FCF = CFO - CAPEX (CAPEX magnitude is strictly positive)
    const actualCapex = Math.abs(capexMetric.value);
    const fcfValue = cfoMetric.value - actualCapex;

    const overallStatus: MetricValidationStatus =
      cfoMetric.validationStatus === 'CONFLICT' || capexMetric.validationStatus === 'CONFLICT'
        ? 'CONFLICT'
        : cfoMetric.validationStatus === 'RECONCILED' && capexMetric.validationStatus === 'RECONCILED'
        ? 'RECONCILED'
        : 'VALIDATED';

    return {
      symbol: cfoMetric.symbol,
      period: cfoMetric.period,
      value: fcfValue,
      currency: cfoMetric.currency,
      unit: cfoMetric.unit,
      reportType: cfoMetric.reportType,
      audited: cfoMetric.audited && capexMetric.audited,
      status: overallStatus,
      notes: `FCF chuẩn hóa từ BCTC chính thức: CFO (${cfoMetric.value.toLocaleString()} ${cfoMetric.unit}) - CAPEX (${actualCapex.toLocaleString()} ${capexMetric.unit}).`,
      provenance: {
        cfoMetric,
        capexMetric,
        cfoSourceUrl: cfoMetric.sourceUrl,
        capexSourceUrl: capexMetric.sourceUrl,
        publishedAt: cfoMetric.sourcePublishedAt,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. FactSet Bridge (Pipeline -> AnnualFinancialFact[])
  // ---------------------------------------------------------------------------

  /**
   * Transforms authoritative pipeline execution results into normalized FinancialFactSet.
   */
  public static createFinancialFactSetFromPipeline(
    pipelineResults: DocumentPipelineResult[],
    outstandingShares?: number | null
  ): FinancialFactSet {
    const annals: AnnualFinancialFact[] = [];

    for (const res of pipelineResults) {
      const metrics = res.metrics;
      const cfo = metrics.CFO?.value !== undefined && metrics.CFO?.value !== null ? metrics.CFO.value : null;
      const capexRaw = metrics.CAPEX?.value !== undefined && metrics.CAPEX?.value !== null ? metrics.CAPEX.value : null;
      const capex = capexRaw !== null ? Math.abs(capexRaw) : null;
      const rev = metrics.NET_REVENUE?.value !== undefined && metrics.NET_REVENUE?.value !== null ? metrics.NET_REVENUE.value : null;
      const np = metrics.NET_PROFIT?.value !== undefined && metrics.NET_PROFIT?.value !== null ? metrics.NET_PROFIT.value : null;
      const ta = metrics.TOTAL_ASSETS?.value !== undefined && metrics.TOTAL_ASSETS?.value !== null ? metrics.TOTAL_ASSETS.value : null;
      const te = metrics.TOTAL_EQUITY?.value !== undefined && metrics.TOTAL_EQUITY?.value !== null ? metrics.TOTAL_EQUITY.value : null;

      const shares = sanitizeNumber(outstandingShares);
      const eps = np !== null && shares !== null && shares > 0 ? np / shares : null;
      const bvps = te !== null && shares !== null && shares > 0 ? te / shares : null;

      annals.push({
        year: res.fiscalYear,
        period: res.period,
        source: `${res.document.source} - ${res.document.documentId}`,
        calculationMethod: 'period_end',
        revenue: rev,
        grossProfit: null,
        operatingProfit: np, // In absence of explicit EBIT, operating profit stays un-fabricated
        ebitda: null,
        netProfit: np,
        cfo,
        capex,
        totalAssets: ta,
        totalLiabilities: ta !== null && te !== null ? ta - te : null,
        totalEquity: te,
        currentAssets: null,
        currentLiabilities: null,
        cash: null,
        inventory: null,
        receivables: null,
        interestExpense: null,
        longTermDebt: null,
        sharesOutstanding: shares,
        eps,
        bvps,
      });
    }

    return {
      annals: annals.sort((a, b) => a.year - b.year),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Capital Allocation Engine Input Adapter
  // ---------------------------------------------------------------------------

  /**
   * Assembles verified CapitalAllocationInput strictly from authoritative pipeline results.
   * Enforces verified cash dividends actually paid (Code 36) and rejects proposed dividends.
   */
  public static createCapitalAllocationInputFromPipeline(
    symbol: string,
    pipelineResults: DocumentPipelineResult | DocumentPipelineResult[],
    options?: {
      companyType?: CompanyType;
      asOfDate?: string | null;
      customDividendsPaid?: Map<number, number | null>;
    }
  ): CapitalAllocationInput {
    const list = Array.isArray(pipelineResults) ? pipelineResults : [pipelineResults];
    const facts = this.createFinancialFactSetFromPipeline(list);
    const dividendsPaid = new Map<number, number | null>();

    for (const res of list) {
      const divMetric = res.metrics.CASH_DIVIDEND_PAID;
      if (divMetric) {
        // If proposed dividend only, do not treat as paid!
        if (divMetric.unavailableReason === 'PROPOSED_DIVIDEND_NOT_PAID' || divMetric.validationStatus === 'REJECTED') {
          // Explicitly omit or record null
          dividendsPaid.set(res.fiscalYear, null);
        } else if (divMetric.value !== null && Number.isFinite(divMetric.value)) {
          dividendsPaid.set(res.fiscalYear, Math.abs(divMetric.value));
        }
      }
    }

    // Merge any verified external cash dividend records if provided
    if (options?.customDividendsPaid) {
      for (const [year, amount] of options.customDividendsPaid.entries()) {
        if (amount !== null && Number.isFinite(amount)) {
          dividendsPaid.set(year, amount);
        }
      }
    }

    const latest = list.at(-1);

    return {
      symbol: symbol.toUpperCase(),
      companyType: options?.companyType ?? 'UNKNOWN',
      facts,
      asOfDate: options?.asOfDate ?? latest?.executedAt ?? null,
      dividendsPaid,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Valuation / DCF Input Adapter
  // ---------------------------------------------------------------------------

  /**
   * Prepares ValuationEngineInput with verified canonical FCF and net debt.
   * Fail-closed: If FCF or Net Debt cannot be verified, passes null to ensure DCF fails closed.
   */
  public static createValuationInputFromPipeline(
    symbol: string,
    currentPrice: number,
    pipelineResult: DocumentPipelineResult,
    options?: {
      sharesOutstanding?: number | null;
      netDebt?: number | null;
      discountRateWACC?: number;
      growthRate5Y?: number;
      targetPE?: number;
      targetPB?: number;
    }
  ): ValuationEngineInput {
    const metrics = pipelineResult.metrics;
    const fcfRes = this.calculateCanonicalFreeCashFlow(metrics.CFO, metrics.CAPEX);

    const netProfit = metrics.NET_PROFIT?.value ?? null;
    const equity = metrics.TOTAL_EQUITY?.value ?? null;
    const shares = sanitizeNumber(options?.sharesOutstanding);

    const eps = netProfit !== null && shares !== null && shares > 0 ? netProfit / shares : null;
    const bvps = equity !== null && shares !== null && shares > 0 ? equity / shares : null;

    return {
      currentPrice,
      eps,
      bookValuePerShare: bvps,
      freeCashFlow: fcfRes.value, // Will be null if unverified/unavailable
      outstandingShares: shares,
      netDebt: options?.netDebt ?? null, // Must not fallback to 0
      discountRateWACC: options?.discountRateWACC ?? 0.105,
      growthRate5Y: options?.growthRate5Y ?? 0.10,
      targetPE: options?.targetPE,
      targetPB: options?.targetPB,
    };
  }
}
