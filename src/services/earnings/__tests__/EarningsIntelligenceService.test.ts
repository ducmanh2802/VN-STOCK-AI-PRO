import { describe, it, expect, beforeEach } from 'vitest';
import { EarningsIntelligenceService } from '../EarningsIntelligenceService.ts';
import { cacheClear } from '../../market/marketDataCache.ts';
import type { EarningsFactRequest } from '../EarningsDataProvider.ts';

describe('Phase 24 — EarningsIntelligenceService', () => {
  beforeEach(() => {
    cacheClear();
  });

  const canonicalDoc = {
    documentId: 'AUDITED_REPORT_HPG_2023',
    symbol: 'HPG',
    title: 'Báo cáo tài chính kiểm toán 2023',
    source: 'HOSE' as const,
    format: 'PDF' as const,
    url: 'https://example.com/hpg-audited-2023.pdf',
    publishedAt: '2024-03-20T08:00:00.000Z',
    period: 'FY_2023',
    fiscalYear: 2023,
    periodEnd: '2023-12-31',
    reportType: 'CONSOLIDATED' as const,
    auditStatus: 'AUDITED' as const,
    checksum: 'mock-checksum',
    declaredUnit: 'TRIEU_DONG',
    declaredCurrency: 'VND',
  };

  const sampleIncomePayload: EarningsFactRequest = {
    symbol: 'HPG',
    period: 'FY_2023',
    fiscalYear: 2023,
    reportType: 'CONSOLIDATED',
    rawPayload: {
      document: canonicalDoc,
      statementType: 'INCOME_STATEMENT',
      declaredUnit: 'TRIEU_DONG',
      lines: [
        { code: '10', nameVi: 'Doanh thu thuần về bán hàng và cung cấp dịch vụ', valueRaw: '120.000', confidence: 1.0 },
        { code: '60', nameVi: 'Lợi nhuận sau thuế thu nhập doanh nghiệp', valueRaw: '6.800', confidence: 1.0 },
        { code: '61', nameVi: 'Lợi nhuận sau thuế của cổ đông công ty mẹ', valueRaw: '6.800', confidence: 1.0 },
        { code: '20', nameVi: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', valueRaw: '8.000', confidence: 1.0 },
        { code: '21', nameVi: 'Tiền chi để mua sắm, xây dựng TSCĐ và các TSDH khác', valueRaw: '-2.000', confidence: 1.0 },
      ],
    },
  };

  it('aggregates snapshot from real authoritative payload and adheres to PR-01 freshness', async () => {
    const snapshot = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [sampleIncomePayload],
      weightedShares: 5_800_000_000,
    });

    expect(snapshot.symbol).toBe('HPG');
    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.lineage.engine).toBe('EarningsEngine');
    expect(snapshot.lineage.calculationVersion).toBe('24.0.0-PROD');

    // Income statement
    expect(snapshot.incomeStatement?.revenue).toBe(120_000_000_000);
    expect(snapshot.incomeStatement?.netProfit).toBe(6_800_000_000);
    expect(snapshot.incomeStatement?.grossProfit).toBeNull(); // Not extracted by Phase 19.6 parser -> fail-closed null

    // Margins
    expect(snapshot.margins?.netMargin).toBeCloseTo((6_800 / 120_000) * 100, 2); // 5.67%

    // Cash flow & FCF
    expect(snapshot.cashFlow?.operatingCashFlow).toBe(8_000_000_000);
    expect(snapshot.cashFlow?.capex).toBe(2_000_000_000);
    expect(snapshot.cashFlow?.freeCashFlow).toBe(6_000_000_000); // 8B - 2B = 6B
  });

  it('serves cached snapshot within 60s TTL window and isolates keys by symbol and scope', async () => {
    const snap1 = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [sampleIncomePayload],
    });

    const snap2 = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [sampleIncomePayload],
    });

    // Identical object reference from in-memory TTL cache
    expect(snap1).toBe(snap2);

    // Another symbol gets its own isolated cache entry
    const snapFpt = await EarningsIntelligenceService.getSnapshot('FPT', {
      asOfDate: '2024-04-01',
    });
    expect(snapFpt.symbol).toBe('FPT');
    expect(snapFpt).not.toBe(snap1);
  });

  it('bypasses cache when forceRefresh is requested', async () => {
    const snap1 = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [sampleIncomePayload],
    });

    const snap2 = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [sampleIncomePayload],
      forceRefresh: true,
    });

    expect(snap1.symbol).toBe('HPG');
    expect(snap2.symbol).toBe('HPG');
    expect(snap2).not.toBe(snap1);
  });

  it('fails closed when no authoritative facts are available', async () => {
    const emptySnap = await EarningsIntelligenceService.getSnapshot('UNKNOWN_SYMBOL', {
      asOfDate: '2026-10-02',
    });

    expect(emptySnap.symbol).toBe('UNKNOWN_SYMBOL');
    expect(emptySnap.dataFreshness).toBe('UNAVAILABLE');
    expect(emptySnap.incomeStatement).toBeNull();
    expect(emptySnap.balanceSheet).toBeNull();
    expect(emptySnap.cashFlow).toBeNull();
    expect(emptySnap.warnings.some((w) => w.includes('No authoritative financial facts'))).toBe(true);
  });
});
