import { describe, it, expect } from 'vitest';
import { CorporateActionSnapshotBuilder } from '../CorporateActionSnapshotBuilder.ts';
import { VietnamCorporateActionsRegistry } from '../VietnamCorporateActionsRegistry.ts';

describe('Phase 23 — CorporateActionSnapshotBuilder', () => {
  it('builds a complete deterministic snapshot for HPG', () => {
    const actions = VietnamCorporateActionsRegistry.getBySymbol('HPG');
    const historicalQuotes = new Map<string, number>([
      ['2024-05-22', 30_000], // PrevClose for 2024-05-22 exDate
    ]);

    const snapshot = CorporateActionSnapshotBuilder.buildSnapshot({
      symbol: 'HPG',
      asOfDate: '2024-06-01',
      actions,
      historicalQuotes,
      currentMarketPrice: 28_000,
    });

    expect(snapshot.symbol).toBe('HPG');
    // P0-02: freshness is the weakest state of the contributing records, computed
    // from their real source timestamps — never a hardcoded CURRENT. The 2024 HPG
    // disclosures are older than the disclosure TTL, so STALE is the honest label.
    expect(snapshot.dataFreshness).toBe('STALE');
    expect(snapshot.dataFreshness).not.toBe('CURRENT');
    expect(snapshot.dataLineage.engine).toBe('CorporateActionEngine');
    expect(snapshot.dataLineage.calculationVersion).toBe('23.0.0-PROD');

    // Historical events (exDate < 2024-06-01)
    expect(snapshot.historicalEvents.length).toBeGreaterThan(0);
    expect(snapshot.adjustmentFactors.length).toBeGreaterThan(0);

    // Dividend summary
    expect(snapshot.dividendSummary.lastDividendDate).toBe('2024-05-22');
    expect(snapshot.dividendSummary.lastCashAmountVnd).toBe(500);
    expect(snapshot.dividendSummary.ttmCashDividendsVnd).toBe(500);
    expect(snapshot.dividendSummary.historicalYieldPercent).toBeCloseTo((500 / 28_000) * 100, 2);
  });

  it('omits CANCELLED actions from upcoming and historical event lists', () => {
    const rawActions = VietnamCorporateActionsRegistry.getBySymbol('HPG');
    const modifiedActions = rawActions.map((a) =>
      a.id === 'CA_HPG_CASH_DIV_2024-05-23' ? { ...a, status: 'CANCELLED' as const } : a
    );

    const snapshot = CorporateActionSnapshotBuilder.buildSnapshot({
      symbol: 'HPG',
      asOfDate: '2024-06-01',
      actions: modifiedActions,
    });

    expect(snapshot.historicalEvents.some((a) => a.id === 'CA_HPG_CASH_DIV_2024-05-23')).toBe(false);
  });

  it('handles symbol with no corporate actions gracefully', () => {
    const snapshot = CorporateActionSnapshotBuilder.buildSnapshot({
      symbol: 'NEW_STOCK',
      asOfDate: '2026-10-01',
      actions: [],
      currentMarketPrice: 15_000,
    });

    expect(snapshot.symbol).toBe('NEW_STOCK');
    expect(snapshot.upcomingEvents).toHaveLength(0);
    expect(snapshot.historicalEvents).toHaveLength(0);
    expect(snapshot.adjustmentFactors).toHaveLength(0);
    expect(snapshot.dividendSummary.ttmCashDividendsVnd).toBeNull();
    expect(snapshot.dividendSummary.historicalYieldPercent).toBeNull();
  });
});
