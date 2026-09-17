/**
 * PHASE 19.7 — AUTHORITATIVE FINANCIAL FACTS INTEGRATION TEST SUITE
 * =================================================================
 * Verifies system-wide integration of the Authoritative Financial Document Pipeline (Phase 19.6):
 * 1. FCF calculated correctly from verified canonical CFO and CAPEX.
 * 2. FCF fails closed (DATA_UNAVAILABLE) if CFO is missing.
 * 3. FCF fails closed (DATA_UNAVAILABLE) if CAPEX is missing.
 * 4. FCF fails closed if CFO and CAPEX periods or symbols mismatch.
 * 5. FCF fails closed if consolidation basis mismatches (e.g. Consolidated CFO vs Separate CAPEX).
 * 6. Capital Allocation Engine consumes canonical facts and fails closed when mandatory inputs are unavailable.
 * 7. Capital Allocation Engine distinguishes verified cash dividends paid vs proposed dividends.
 * 8. DCF valuation calculates accurately with valid verified canonical inputs.
 * 9. DCF valuation fails closed when FCF is null or negative.
 * 10. DCF valuation fails closed when net debt is null/unverified (no silent netDebt ?? 0).
 * 11. DCF valuation fails closed when shares outstanding is null or <= 0.
 * 12. End-to-end consistency: A single canonical financial fact produces identical metric across FCF, Capital Allocation, Valuation, and Stock Detail.
 */

import { describe, expect, it } from 'vitest';
import {
  CanonicalFinancialFactsAdapter,
} from '../index.ts';
import type {
  ExtractedFinancialMetric,
  DocumentPipelineResult,
  DiscoveredFinancialDocument,
} from '../types.ts';
import { CapitalAllocationEngine } from '../../../lib/analysis/capitalAllocation/CapitalAllocationEngine.ts';
import { calculateDCFValuation } from '../../../lib/analysis/valuation/formulas.ts';
import { ValuationEngine } from '../../../lib/analysis/valuation/ValuationEngine.ts';

// Helper to build verified authoritative metric fixtures
const createMetricFixture = (
  overrides: Partial<ExtractedFinancialMetric>
): ExtractedFinancialMetric => ({
  symbol: 'VNM',
  metric: 'CFO',
  value: 10_000_000_000_000, // 10,000 billion VND
  currency: 'VND',
  unit: 'VND',
  period: 'FY_2024',
  periodEnd: '2024-12-31',
  statementType: 'CASH_FLOW_INDIRECT',
  reportType: 'CONSOLIDATED',
  audited: true,
  sourceUrl: 'https://hose.vn/disclosures/vnm_2024_audited.pdf',
  sourceDocumentId: 'HOSE_VNM_2024_BCTC_HN_KT',
  sourcePublishedAt: '2025-03-15T08:00:00Z',
  extractedAt: '2025-03-15T08:05:00Z',
  extractionMethod: 'NATIVE_TABLE_PARSER',
  confidence: 0.98,
  validationStatus: 'VALIDATED',
  notes: 'VAS Code 20',
  ...overrides,
});

const createDocFixture = (
  overrides: Partial<DiscoveredFinancialDocument>
): DiscoveredFinancialDocument => ({
  documentId: 'HOSE_VNM_2024_BCTC_HN_KT',
  symbol: 'VNM',
  title: 'Báo cáo tài chính hợp nhất kiểm toán năm 2024',
  source: 'HOSE',
  format: 'PDF',
  url: 'https://hose.vn/disclosures/vnm_2024_audited.pdf',
  publishedAt: '2025-03-15T08:00:00Z',
  period: 'FY_2024',
  fiscalYear: 2024,
  periodEnd: '2024-12-31',
  reportType: 'CONSOLIDATED',
  auditStatus: 'AUDITED',
  checksum: 'sha256-vnm-2024',
  declaredUnit: 'VND',
  declaredCurrency: 'VND',
  ...overrides,
});

const createPipelineResultFixture = (
  overrides: Partial<DocumentPipelineResult>
): DocumentPipelineResult => ({
  symbol: 'VNM',
  period: 'FY_2024',
  fiscalYear: 2024,
  reportType: 'CONSOLIDATED',
  audited: true,
  document: createDocFixture({}),
  metrics: {},
  reconciliations: {},
  pipelineStatus: 'SUCCESS',
  errors: [],
  warnings: [],
  executedAt: '2025-03-15T09:00:00Z',
  ...overrides,
});

describe('Phase 19.7 — Authoritative Financial Facts Integration', () => {
  // -------------------------------------------------------------------------
  // Test 1: FCF calculated correctly from verified canonical CFO and CAPEX
  // -------------------------------------------------------------------------
  it('1. FCF calculated correctly from verified canonical CFO and CAPEX', () => {
    const cfo = createMetricFixture({
      metric: 'CFO',
      notes: 'VAS Code 20',
      value: 10_500_000_000_000,
    });
    const capex = createMetricFixture({
      metric: 'CAPEX',
      notes: 'VAS Code 21',
      value: 2_500_000_000_000,
    });

    const fcf = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfo, capex);

    expect(fcf.status).toBe('VALIDATED');
    expect(fcf.value).toBe(8_000_000_000_000); // 10.5T - 2.5T = 8.0T
    expect(fcf.symbol).toBe('VNM');
    expect(fcf.period).toBe('FY_2024');
    expect(fcf.reportType).toBe('CONSOLIDATED');
    expect(fcf.audited).toBe(true);
    expect(fcf.provenance?.cfoMetric?.notes).toBe('VAS Code 20');
    expect(fcf.provenance?.capexMetric?.notes).toBe('VAS Code 21');
  });

  // -------------------------------------------------------------------------
  // Test 2: FCF fails closed (DATA_UNAVAILABLE) if CFO is missing
  // -------------------------------------------------------------------------
  it('2. FCF fails closed (DATA_UNAVAILABLE) if CFO is missing', () => {
    const capex = createMetricFixture({
      metric: 'CAPEX',
      value: 2_500_000_000_000,
    });

    const fcfNull = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(null, capex);
    expect(fcfNull.value).toBeNull();
    expect(fcfNull.status).toBe('UNAVAILABLE');
    expect(fcfNull.unavailableReason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');

    const cfoMissingVal = createMetricFixture({ value: null, validationStatus: 'UNAVAILABLE' });
    const fcfMissingVal = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfoMissingVal, capex);
    expect(fcfMissingVal.value).toBeNull();
    expect(fcfMissingVal.status).toBe('UNAVAILABLE');
  });

  // -------------------------------------------------------------------------
  // Test 3: FCF fails closed (DATA_UNAVAILABLE) if CAPEX is missing
  // -------------------------------------------------------------------------
  it('3. FCF fails closed (DATA_UNAVAILABLE) if CAPEX is missing (never defaults to CFO)', () => {
    const cfo = createMetricFixture({
      metric: 'CFO',
      value: 10_500_000_000_000,
    });

    const fcfNullCapex = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfo, null);
    expect(fcfNullCapex.value).toBeNull();
    expect(fcfNullCapex.status).toBe('UNAVAILABLE');
    expect(fcfNullCapex.unavailableReason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');

    const capexUnavailable = createMetricFixture({
      metric: 'CAPEX',
      value: null,
      validationStatus: 'UNAVAILABLE',
      unavailableReason: 'REQUIRED_LINE_ITEM_NOT_FOUND',
    });
    const fcfMissing = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfo, capexUnavailable);
    expect(fcfMissing.value).toBeNull();
    expect(fcfMissing.status).toBe('UNAVAILABLE');
  });

  // -------------------------------------------------------------------------
  // Test 4: FCF fails closed if CFO and CAPEX periods or symbols mismatch
  // -------------------------------------------------------------------------
  it('4. FCF fails closed if CFO and CAPEX periods or symbols mismatch', () => {
    const cfoVNM = createMetricFixture({ symbol: 'VNM', period: 'FY_2024' });
    const capexHPG = createMetricFixture({ symbol: 'HPG', period: 'FY_2024' });

    // Symbol mismatch
    const fcfSymbolMismatch = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfoVNM, capexHPG);
    expect(fcfSymbolMismatch.value).toBeNull();
    expect(fcfSymbolMismatch.status).toBe('REJECTED');
    expect(fcfSymbolMismatch.unavailableReason).toBe('PERIOD_MISMATCH');

    // Period mismatch
    const capex2023 = createMetricFixture({ symbol: 'VNM', period: 'FY_2023' });
    const fcfPeriodMismatch = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfoVNM, capex2023);
    expect(fcfPeriodMismatch.value).toBeNull();
    expect(fcfPeriodMismatch.status).toBe('REJECTED');
    expect(fcfPeriodMismatch.unavailableReason).toBe('PERIOD_MISMATCH');
  });

  // -------------------------------------------------------------------------
  // Test 5: FCF fails closed if consolidation basis mismatches
  // -------------------------------------------------------------------------
  it('5. FCF fails closed if consolidation basis mismatches (e.g. Consolidated CFO vs Separate CAPEX)', () => {
    const cfoConsolidated = createMetricFixture({
      metric: 'CFO',
      reportType: 'CONSOLIDATED',
    });
    const capexSeparate = createMetricFixture({
      metric: 'CAPEX',
      reportType: 'SEPARATE',
    });

    const fcf = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(cfoConsolidated, capexSeparate);
    expect(fcf.value).toBeNull();
    expect(fcf.status).toBe('REJECTED');
    expect(fcf.unavailableReason).toBe('AMBIGUOUS_CONSOLIDATION_STATUS');
  });

  // -------------------------------------------------------------------------
  // Test 6: Capital Allocation Engine consumes canonical facts and fails closed
  // -------------------------------------------------------------------------
  it('6. Capital Allocation Engine consumes canonical facts and fails closed when mandatory inputs are unavailable', () => {
    // Missing CFO & CAPEX in authoritative document
    const emptyPipelineResult = createPipelineResultFixture({
      metrics: {
        NET_REVENUE: createMetricFixture({ metric: 'NET_REVENUE', value: 60_000_000_000_000 }),
        NET_PROFIT: createMetricFixture({ metric: 'NET_PROFIT', value: 9_000_000_000_000 }),
        // CFO and CAPEX absent
      },
    });

    const input = CanonicalFinancialFactsAdapter.createCapitalAllocationInputFromPipeline('VNM', emptyPipelineResult);
    const analysis = CapitalAllocationEngine.analyze(input);

    expect(analysis.dataStatus).toBe('DATA_UNAVAILABLE');
    expect(analysis.score).toBeNull();
    expect(analysis.metrics.fcf.value).toBeNull();
    expect(analysis.unavailableReasons.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 7: Capital Allocation Engine distinguishes verified cash dividends paid vs proposed dividends
  // -------------------------------------------------------------------------
  it('7. Capital Allocation Engine distinguishes verified cash dividends paid vs proposed dividends', () => {
    // Pipeline result with PROPOSED dividend (e.g. AGM resolution, not Code 36 cash flow)
    const proposedDivPipelineResult = createPipelineResultFixture({
      metrics: {
        CFO: createMetricFixture({ metric: 'CFO', value: 10_000_000_000_000 }),
        CAPEX: createMetricFixture({ metric: 'CAPEX', value: 2_000_000_000_000 }),
        NET_PROFIT: createMetricFixture({ metric: 'NET_PROFIT', value: 8_000_000_000_000 }),
        TOTAL_EQUITY: createMetricFixture({ metric: 'TOTAL_EQUITY', value: 35_000_000_000_000 }),
        CASH_DIVIDEND_PAID: createMetricFixture({
          metric: 'CASH_DIVIDEND_PAID',
          value: null,
          validationStatus: 'UNAVAILABLE',
          unavailableReason: 'PROPOSED_DIVIDEND_NOT_PAID',
        }),
      },
    });

    const inputProposed = CanonicalFinancialFactsAdapter.createCapitalAllocationInputFromPipeline('VNM', proposedDivPipelineResult);
    const analysisProposed = CapitalAllocationEngine.analyze(inputProposed);

    // Because proposed dividend was rejected, verified dividend record is absent -> fails closed on payout
    expect(analysisProposed.dataStatus).toBe('DATA_UNAVAILABLE');
    expect(analysisProposed.unavailableReasons.some((r) => r.includes('cổ tức tiền mặt thực trả'))).toBe(true);

    // Now test with verified Code 36 cash dividend paid
    const verifiedDivPipelineResult = createPipelineResultFixture({
      metrics: {
        ...proposedDivPipelineResult.metrics,
        CASH_DIVIDEND_PAID: createMetricFixture({
          metric: 'CASH_DIVIDEND_PAID',
          notes: 'VAS Code 36',
          value: 4_000_000_000_000,
          validationStatus: 'VALIDATED',
        }),
      },
    });

    const inputVerified = CanonicalFinancialFactsAdapter.createCapitalAllocationInputFromPipeline('VNM', verifiedDivPipelineResult);
    const analysisVerified = CapitalAllocationEngine.analyze(inputVerified);

    expect(analysisVerified.dataStatus).toBe('OK');
    expect(analysisVerified.metrics.fcf.value).toBe(8_000_000_000_000); // 10T - 2T
    expect(analysisVerified.metrics.dividendPayout.value).toBe(50); // 4T / 8T = 50%
  });

  // -------------------------------------------------------------------------
  // Test 8: DCF valuation calculates accurately with valid verified canonical inputs
  // -------------------------------------------------------------------------
  it('8. DCF valuation calculates accurately with valid verified canonical inputs', () => {
    const validDcf = calculateDCFValuation({
      freeCashFlow: 8_000_000_000_000, // 8,000 billion VND
      outstandingShares: 2_089_955_445, // ~2.09 billion shares
      netDebt: 5_000_000_000_000,     // 5,000 billion VND
      growthRate5Y: 0.08,             // 8%
      terminalGrowthRate: 0.03,       // 3%
      discountRateWACC: 0.11,         // 11%
    });

    expect(validDcf.value).not.toBeNull();
    expect(validDcf.value!).toBeGreaterThan(10000);
    expect(validDcf.reason).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 9: DCF valuation fails closed when FCF is null or negative
  // -------------------------------------------------------------------------
  it('9. DCF valuation fails closed when FCF is null or negative', () => {
    // Null FCF
    const nullFcf = calculateDCFValuation({
      freeCashFlow: null,
      outstandingShares: 1_000_000_000,
      netDebt: 0,
    });
    expect(nullFcf.value).toBeNull();
    expect(nullFcf.reason).toContain('Thiếu dòng tiền tự do');

    // Negative FCF
    const negFcf = calculateDCFValuation({
      freeCashFlow: -500_000_000,
      outstandingShares: 1_000_000_000,
      netDebt: 0,
    });
    expect(negFcf.value).toBeNull();
    expect(negFcf.reason).toContain('Dòng tiền tự do (FCF) âm');
  });

  // -------------------------------------------------------------------------
  // Test 10: DCF valuation fails closed when net debt is null/unverified (no silent netDebt ?? 0)
  // -------------------------------------------------------------------------
  it('10. DCF valuation fails closed when net debt is null/unverified (no silent netDebt ?? 0)', () => {
    const missingNetDebt = calculateDCFValuation({
      freeCashFlow: 5_000_000_000,
      outstandingShares: 100_000_000,
      netDebt: null, // Null net debt must not silently fall back to 0!
    });

    expect(missingNetDebt.value).toBeNull();
    expect(missingNetDebt.reason).toContain('Thiếu dữ liệu nợ thuần (Net Debt)');

    const undefinedNetDebt = calculateDCFValuation({
      freeCashFlow: 5_000_000_000,
      outstandingShares: 100_000_000,
      // netDebt omitted
    });
    expect(undefinedNetDebt.value).toBeNull();
    expect(undefinedNetDebt.reason).toContain('Thiếu dữ liệu nợ thuần (Net Debt)');
  });

  // -------------------------------------------------------------------------
  // Test 11: DCF valuation fails closed when shares outstanding is null or <= 0
  // -------------------------------------------------------------------------
  it('11. DCF valuation fails closed when shares outstanding is null or <= 0', () => {
    const nullShares = calculateDCFValuation({
      freeCashFlow: 5_000_000_000,
      outstandingShares: null,
      netDebt: 1_000_000_000,
    });
    expect(nullShares.value).toBeNull();
    expect(nullShares.reason).toContain('Thiếu dòng tiền tự do (FCF) hoặc số lượng cổ phiếu');

    const zeroShares = calculateDCFValuation({
      freeCashFlow: 5_000_000_000,
      outstandingShares: 0,
      netDebt: 1_000_000_000,
    });
    expect(zeroShares.value).toBeNull();
    expect(zeroShares.reason).toContain('Số lượng cổ phiếu lưu hành không hợp lệ');

    const negativeShares = calculateDCFValuation({
      freeCashFlow: 5_000_000_000,
      outstandingShares: -100_000,
      netDebt: 1_000_000_000,
    });
    expect(negativeShares.value).toBeNull();
    expect(negativeShares.reason).toContain('Số lượng cổ phiếu lưu hành không hợp lệ');
  });

  // -------------------------------------------------------------------------
  // Test 12: End-to-end consistency across FCF, Capital Allocation, Valuation, and Stock Detail
  // -------------------------------------------------------------------------
  it('12. End-to-end consistency: A single canonical financial fact produces identical metric across FCF, Capital Allocation, Valuation, and Stock Detail', () => {
    // Define single authoritative source fact
    const cfoVal = 12_000_000_000_000;
    const capexVal = 3_000_000_000_000;
    const expectedCanonicalFCF = 9_000_000_000_000; // Exactly 12T - 3T
    const netProfitVal = 10_000_000_000_000;
    const equityVal = 40_000_000_000_000;
    const dividendPaidVal = 4_500_000_000_000;
    const shares = 2_000_000_000;
    const netDebtVal = 2_000_000_000_000;

    const pipelineResult = createPipelineResultFixture({
      document: createDocFixture({
        documentId: 'HOSE_VNM_2024_AUDITED',
        symbol: 'VNM',
        period: 'FY_2024',
        fiscalYear: 2024,
      }),
      period: 'FY_2024',
      fiscalYear: 2024,
      metrics: {
        CFO: createMetricFixture({ notes: 'VAS Code 20', value: cfoVal }),
        CAPEX: createMetricFixture({ notes: 'VAS Code 21', value: capexVal }),
        NET_PROFIT: createMetricFixture({ notes: 'VAS Code 60', value: netProfitVal }),
        TOTAL_EQUITY: createMetricFixture({ notes: 'VAS Code 400', value: equityVal }),
        CASH_DIVIDEND_PAID: createMetricFixture({ notes: 'VAS Code 36', value: dividendPaidVal }),
      },
    });

    // 1. Canonical FCF Layer
    const canonicalFcf = CanonicalFinancialFactsAdapter.calculateCanonicalFreeCashFlow(
      pipelineResult.metrics.CFO,
      pipelineResult.metrics.CAPEX
    );
    expect(canonicalFcf.value).toBe(expectedCanonicalFCF);

    // 2. Capital Allocation Engine
    const allocInput = CanonicalFinancialFactsAdapter.createCapitalAllocationInputFromPipeline('VNM', pipelineResult);
    const allocResult = CapitalAllocationEngine.analyze(allocInput);
    expect(allocResult.metrics.fcf.value).toBe(expectedCanonicalFCF); // Identical to canonical FCF!
    expect(allocResult.metrics.cfo.value).toBe(cfoVal);
    expect(allocResult.metrics.capex.value).toBe(capexVal);

    // 3. Valuation Engine
    const valInput = CanonicalFinancialFactsAdapter.createValuationInputFromPipeline('VNM', 70000, pipelineResult, {
      sharesOutstanding: shares,
      netDebt: netDebtVal,
    });
    expect(valInput.freeCashFlow).toBe(expectedCanonicalFCF); // Identical to canonical FCF!

    const valuationResult = ValuationEngine.evaluate(valInput);
    expect(valuationResult.fairValueDCF).not.toBeNull();
    expect(valuationResult.fairValueDCF!).toBeGreaterThan(0);

    // Invariant: ONE financial fact -> ONE definition -> identical value across all engines
    expect(allocResult.metrics.fcf.value).toBe(canonicalFcf.value);
    expect(valInput.freeCashFlow).toBe(canonicalFcf.value);
  });
});
