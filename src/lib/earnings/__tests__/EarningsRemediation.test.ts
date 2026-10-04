/**
 * PHASE 24 — REMEDIATION REGRESSION TESTS (P24-D1..D14)
 * ====================================================
 * Explicit evidence for every behavior change introduced during Phase 24
 * certification remediation. Each test fails on the pre-remediation code and
 * passes after. No production paths are touched here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EpsEngine } from '../EpsEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { BalanceSheetEngine } from '../BalanceSheetEngine.ts';
import { IncomeStatementEngine } from '../IncomeStatementEngine.ts';
import { MarginEngine } from '../MarginEngine.ts';
import { EarningsGrowthEngine, type PeriodValue } from '../EarningsGrowthEngine.ts';
import { RestatementEngine } from '../RestatementEngine.ts';
import { EarningsSnapshotBuilder } from '../EarningsSnapshotBuilder.ts';
import { EarningsDataProvider, combineFreshness } from '../../../services/earnings/EarningsDataProvider.ts';
import { EarningsIntelligenceService } from '../../../services/earnings/EarningsIntelligenceService.ts';
import { cacheClear } from '../../../services/market/marketDataCache.ts';
import type { EarningsFactRequest } from '../../../services/earnings/EarningsDataProvider.ts';
import { makeFact } from './fixtures.ts';

const Q1_24 = FinancialPeriodEngine.quarter(2024, 1);

describe('Phase 24 remediation — P1 fail-closed defects', () => {
  it('D1: cumulativeShareMultiplier returns null (never throws) on malformed ratios', () => {
    expect(() =>
      EpsEngine.cumulativeShareMultiplier(
        [{ exDate: '2024-06-01', actionType: 'BONUS', rawRatioExpression: 'not-a-ratio', effect: 'INCREASE' }],
        '2024-01-01'
      )
    ).not.toThrow();
    expect(
      EpsEngine.cumulativeShareMultiplier(
        [{ exDate: '2024-06-01', actionType: 'BONUS', rawRatioExpression: 'not-a-ratio', effect: 'INCREASE' }],
        '2024-01-01'
      )
    ).toBeNull();
  });

  it('D1+D9: invalid corporate action yields null adjusted base + reason (no silent reuse)', () => {
    const eps = EpsEngine.compute(
      {
        symbol: 'HPG',
        period: Q1_24,
        reportType: 'CONSOLIDATED',
        netProfit: 1_000,
        parentNetProfit: null,
        weightedShares: 100,
        corporateActions: [
          { exDate: '2024-06-01', actionType: 'BONUS', rawRatioExpression: '0:5', effect: 'INCREASE' },
        ],
      },
      []
    );
    // basic EPS is still computable, but the adjusted base is fail-closed null.
    expect(eps.basicEps).toBe(10);
    expect(eps.comparableShares).toBeNull();
    expect(eps.adjustedBasicEps).toBeNull();
    expect(eps.reason).toBe('VALUE_NON_FINITE');
  });

  it('D2: provider skips unparseable document periods instead of synthesizing FY', () => {
    const provider = new EarningsDataProvider();
    const { facts, issues } = provider.toCanonicalFacts('HPG', [
      {
        period: 'GIBBERISH_PERIOD',
        fiscalYear: 2024,
        reportType: 'CONSOLIDATED',
        metrics: {
          NET_REVENUE: {
            statementType: 'INCOME_STATEMENT',
            period: 'GIBBERISH_PERIOD',
            value: 100,
            currency: 'VND',
            unit: 'VND',
            audited: true,
            sourceDocumentId: 'DOC1',
            sourcePublishedAt: '2024-03-15',
            validationStatus: 'VALIDATED',
          },
        },
        document: { source: 'HOSE' },
      } as unknown as Parameters<EarningsDataProvider['toCanonicalFacts']>[1][number],
    ]);
    expect(facts).toHaveLength(0);
    expect(issues.some((i) => i.includes('fail-closed') && i.includes('GIBBERISH_PERIOD'))).toBe(true);
  });

  it('D2: provider skips malformed metric periods but inherits absent ones', () => {
    const provider = new EarningsDataProvider();
    const metric = (period: string) => ({
      statementType: 'INCOME_STATEMENT',
      period,
      value: 100,
      currency: 'VND',
      unit: 'VND',
      audited: true,
      sourceDocumentId: 'DOC1',
      sourcePublishedAt: '2024-03-15',
      validationStatus: 'VALIDATED',
    });
    const { facts, issues } = provider.toCanonicalFacts('HPG', [
      {
        period: 'FY_2024',
        fiscalYear: 2024,
        reportType: 'CONSOLIDATED',
        metrics: {
          NET_REVENUE: metric('BOGUS'),
          GROSS_PROFIT: metric(''),
        },
        document: { source: 'HOSE' },
      } as unknown as Parameters<EarningsDataProvider['toCanonicalFacts']>[1][number],
    ]);
    // Malformed metric period skipped; empty metric period inherits FY2024.
    expect(facts.map((f) => f.metric)).toEqual(['GROSS_PROFIT']);
    expect(facts[0].period.id).toBe('FY2024');
    expect(issues.some((i) => i.includes('BOGUS'))).toBe(true);
  });

  it('D14: combineFreshness never masks STALE with CURRENT', () => {
    expect(combineFreshness(['CURRENT', 'STALE'])).toBe('STALE');
    expect(combineFreshness(['STALE', 'CURRENT', 'CURRENT'])).toBe('STALE');
    expect(combineFreshness(['INVALID', 'STALE'])).toBe('INVALID');
    expect(combineFreshness(['CURRENT'])).toBe('CURRENT');
    expect(combineFreshness([])).toBe('UNAVAILABLE');
  });
});

describe('Phase 24 remediation — P2 isolation & contract defects', () => {
  it('D5: current vs total current liabilities use distinct keys (no cross-fallback)', () => {
    const onlyCurrent = BalanceSheetEngine.normalize(
      [makeFact('CURRENT_LIABILITIES', Q1_24, 15_000, { statementType: 'BALANCE_SHEET' })],
      Q1_24,
      'CONSOLIDATED'
    );
    expect(onlyCurrent.currentLiabilities).toBe(15_000);
    expect(onlyCurrent.totalCurrentLiabilities).toBeNull();

    const onlyTotal = BalanceSheetEngine.normalize(
      [makeFact('TOTAL_CURRENT_LIABILITIES', Q1_24, 17_000, { statementType: 'BALANCE_SHEET' })],
      Q1_24,
      'CONSOLIDATED'
    );
    expect(onlyTotal.totalCurrentLiabilities).toBe(17_000);
    expect(onlyTotal.currentLiabilities).toBeNull();
  });

  it('D8: margin reasons propagate the source income-field reason (not mis-keyed fallback)', () => {
    const income = IncomeStatementEngine.normalize(
      [
        makeFact('NET_REVENUE', Q1_24, 1_000),
        // Non-finite gross profit -> VALUE_NON_FINITE on the income reason map.
        makeFact('GROSS_PROFIT', Q1_24, Number.NaN),
      ],
      Q1_24,
      'CONSOLIDATED'
    );
    expect(income.reasons.grossProfit).toBe('VALUE_NON_FINITE');
    const margins = MarginEngine.normalize(
      income,
      {
        freeCashFlow: null,
        reasons: {},
        lineage: { sources: [], engine: 't', calculationVersion: 't' },
      } as unknown as Parameters<typeof MarginEngine.normalize>[1]
    );
    expect(margins.grossMargin).toBeNull();
    expect(margins.reasons.grossMargin).toBe('VALUE_NON_FINITE');
  });

  it('D10: TTM revenue/profit align to a common end quarter', () => {
    const q = (y: number, qq: 1 | 2 | 3 | 4) => FinancialPeriodEngine.quarter(y, qq);
    // Revenue runs through Q1-2024; profit stops at Q4-2023 (misaligned).
    const pv = (period: ReturnType<typeof q>, value: number): PeriodValue => ({ period, value });
    const revenueSeries = [pv(q(2023, 1), 10), pv(q(2023, 2), 10), pv(q(2023, 3), 10), pv(q(2023, 4), 10), pv(q(2024, 1), 10)];
    const profitSeries = [pv(q(2023, 1), 1), pv(q(2023, 2), 1), pv(q(2023, 3), 1), pv(q(2023, 4), 1)];
    const result = EarningsGrowthEngine.evaluate(
      {
        symbol: 'HPG',
        currentPeriod: q(2024, 1),
        revenueSeries,
        netProfitSeries: profitSeries,
        parentNetProfitSeries: [],
        epsSeries: [],
      },
      []
    );
    // Common end = Q4-2023: both windows cover Q1..Q4-2023.
    expect(result.ttmRevenue).toBe(40);
    expect(result.ttmNetProfit).toBe(4);
  });

  it('D11: restatement promotion compares against authoritative latest, not insertion order', () => {
    const store = new RestatementEngine();
    const period = Q1_24;
    // Insert low-tier first, high-tier second: insertion-order comparison would
    // use the wrong baseline when a third filing arrives.
    store.append(makeFact('NET_REVENUE', period, 100, { source: 'BROKER_X', sourceTier: 'TIER_4_BROKER_CROSS_CHECK' }));
    store.append(makeFact('NET_REVENUE', period, 100, { source: 'HOSE', sourceTier: 'TIER_2_EXCHANGE' }));
    const res = store.append(
      makeFact('NET_REVENUE', period, 120, { source: 'BROKER_X', sourceTier: 'TIER_4_BROKER_CROSS_CHECK' })
    );
    expect(res.accepted).toBe(true);
    const versions = store.getVersions('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'NET_REVENUE');
    const latest = RestatementEngine.pickLatest(versions);
    // Tier-2 100 remains authoritative over tier-4 120.
    expect(latest?.value).toBe(100);
    expect(latest?.sourceTier).toBe('TIER_2_EXCHANGE');
  });

  it('D7: snapshot builder populates PR-01 dataLineage with statement context', () => {
    const income = IncomeStatementEngine.normalize([makeFact('NET_REVENUE', Q1_24, 1_000)], Q1_24, 'CONSOLIDATED');
    const snap = EarningsSnapshotBuilder.buildSnapshot({
      symbol: 'HPG',
      asOfDate: '2024-04-01',
      income,
      dataFreshness: 'CURRENT',
    });
    expect(snap.dataLineage).toBeDefined();
    expect(snap.dataLineage?.sources).toContain('HOSE');
    expect(snap.dataLineage?.statementId).toBeTruthy();
    expect(snap.dataLineage?.reportId).toBeTruthy();
    expect(snap.lineage.statementId).toBe(snap.dataLineage?.statementId);
  });

  it('D12: derived engines propagate input provenance (no empty sources)', () => {    const income = IncomeStatementEngine.normalize(
      [makeFact('NET_REVENUE', Q1_24, 1_000), makeFact('NET_PROFIT', Q1_24, 100)],
      Q1_24,
      'CONSOLIDATED'
    );
    const margins = MarginEngine.normalize(
      income,
      {
        freeCashFlow: null,
        reasons: { freeCashFlow: 'REQUIRED_LINE_ITEM_NOT_FOUND' },
        lineage: { sources: ['HNX'], engine: 'CashFlowEngine', calculationVersion: 'x' },
      } as unknown as Parameters<typeof MarginEngine.normalize>[1]
    );
    expect(margins.lineage.sources).toContain('HOSE');
    expect(margins.lineage.sources).toContain('HNX');
  });
});

describe('Phase 24 remediation — service isolation & freshness', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('D3: latestFactsFor excludes facts from other symbols (white-box)', () => {
    const store = new RestatementEngine();
    store.appendMany([
      makeFact('NET_REVENUE', Q1_24, 1_000, { symbol: 'HPG' }),
      makeFact('NET_REVENUE', Q1_24, 9_999, { symbol: 'FPT' }),
    ]);
    const svc = EarningsIntelligenceService as unknown as {
      latestFactsFor(sym: string, reportType: 'CONSOLIDATED', periodId: string, store: RestatementEngine): { value: number | null }[];
    };
    const hpg = svc.latestFactsFor('HPG', 'CONSOLIDATED', Q1_24.id, store);
    expect(hpg).toHaveLength(1);
    expect(hpg[0].value).toBe(1_000);
  });

  it('D6: snapshot carries max source publication instant (not null)', async () => {
    const payload: EarningsFactRequest = {
      symbol: 'HPG',
      period: 'FY_2023',
      fiscalYear: 2023,
      reportType: 'CONSOLIDATED',
      rawPayload: {
        document: {
          documentId: 'AUDITED_REPORT_HPG_2023',
          symbol: 'HPG',
          title: 'BCTC 2023',
          source: 'HOSE',
          format: 'PDF',
          url: 'https://example.com/hpg-2023.pdf',
          publishedAt: '2024-03-20T08:00:00.000Z',
          period: 'FY_2023',
          fiscalYear: 2023,
          periodEnd: '2023-12-31',
          reportType: 'CONSOLIDATED',
          auditStatus: 'AUDITED',
          checksum: 'test-checksum',
          declaredUnit: 'TRIEU_DONG',
          declaredCurrency: 'VND',
        },
        statementType: 'INCOME_STATEMENT',
        declaredUnit: 'TRIEU_DONG',
        lines: [
          { code: '10', nameVi: 'Doanh thu thuần', valueRaw: '120.000', confidence: 1.0 },
          { code: '60', nameVi: 'Lợi nhuận sau thuế', valueRaw: '6.800', confidence: 1.0 },
        ],
      },
    };
    const snapshot = await EarningsIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-04-01',
      payloads: [payload],
      forceRefresh: true,
    });
    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.sourceTimestamp).toBe(Date.parse('2024-03-20T08:00:00.000Z'));
  });
});
