import { describe, it, expect } from 'vitest';
import { VietnamCorporateActionsRegistry } from '../VietnamCorporateActionsRegistry.ts';
import type { CorporateAction } from '../types.ts';

describe('Phase 23 — VietnamCorporateActionsRegistry', () => {
  it('retrieves authoritative actions for HPG with both cash and stock dividends', () => {
    const actions = VietnamCorporateActionsRegistry.getBySymbol('HPG');
    expect(actions.length).toBeGreaterThanOrEqual(2);

    const cashDiv = actions.find((a) => a.actionType === 'CASH_DIVIDEND');
    expect(cashDiv).toBeDefined();
    expect(cashDiv?.cashAmountVnd).toBe(500);
    expect(cashDiv?.source).toBe('VSDC');
    expect(cashDiv?.dates.recordDate).toBe('2024-05-23');

    const stockDiv = actions.find((a) => a.actionType === 'STOCK_DIVIDEND');
    expect(stockDiv).toBeDefined();
    expect(stockDiv?.ratio?.rawExpression).toBe('10:1');
    expect(stockDiv?.ratio?.ratioDecimal).toBe(0.10);
    expect(stockDiv?.fractionalPolicy).toBe('FLOOR');
  });

  it('normalizes symbols case-insensitively and handles spaces', () => {
    const fptLower = VietnamCorporateActionsRegistry.getBySymbol('  fpt  ');
    const fptUpper = VietnamCorporateActionsRegistry.getBySymbol('FPT');
    expect(fptLower.length).toBe(fptUpper.length);
    expect(fptLower.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown or unregistered symbols', () => {
    const unknown = VietnamCorporateActionsRegistry.getBySymbol('UNKNOWN_SYMBOL_999');
    expect(unknown).toEqual([]);
  });

  it('partitions actions into upcoming and historical based on asOfDate', () => {
    const historical = VietnamCorporateActionsRegistry.getHistoricalEvents('HPG', '2025-01-01');
    const upcoming = VietnamCorporateActionsRegistry.getUpcomingEvents('HPG', '2025-01-01');

    expect(historical.length).toBeGreaterThan(0);
    expect(historical.every((a) => a.dates.exDate < '2025-01-01')).toBe(true);
    expect(upcoming.every((a) => a.dates.exDate >= '2025-01-01')).toBe(true);
  });

  it('correctly filters active rights issues during the subscription period', () => {
    const ssiRights = VietnamCorporateActionsRegistry.getActiveRights('SSI', '2024-10-15');
    expect(ssiRights.length).toBe(1);
    expect(ssiRights[0].rightsCode).toBe('MIRSSI241');
    expect(ssiRights[0].issuePriceVnd).toBe(15000);

    // Outside window
    const ssiBefore = VietnamCorporateActionsRegistry.getActiveRights('SSI', '2024-10-01');
    expect(ssiBefore.length).toBe(0);

    const ssiAfter = VietnamCorporateActionsRegistry.getActiveRights('SSI', '2024-11-01');
    expect(ssiAfter.length).toBe(0);
  });

  it('supports runtime registration of new verified corporate actions', () => {
    const customAction: CorporateAction = {
      id: 'CA_TEST_CUSTOM_2026-11-01',
      symbol: 'CUSTOM',
      isin: null,
      exchange: 'HOSE',
      actionType: 'CASH_DIVIDEND',
      status: 'ANNOUNCED',
      dates: {
        announcementDate: '2026-10-01',
        exDate: '2026-10-30',
        recordDate: '2026-11-02',
        paymentDate: '2026-11-20',
        tradingDate: null,
        rightsStartDate: null,
        rightsEndDate: null,
      },
      ratio: null,
      cashAmountVnd: 2000,
      cashYieldPercent: 20.0,
      issuePriceVnd: null,
      quantityExpected: null,
      rightsCode: null,
      rightsIsin: null,
      fractionalPolicy: 'NONE',
      source: 'VSDC',
      sourceTimestamp: Date.now(),
      fetchedAt: new Date().toISOString(),
      dataFreshness: 'CURRENT',
      warnings: [],
    };

    VietnamCorporateActionsRegistry.registerAction(customAction);
    const retrieved = VietnamCorporateActionsRegistry.getBySymbol('CUSTOM');
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].cashAmountVnd).toBe(2000);
  });
});
