import { describe, it, expect, beforeEach } from 'vitest';
import { CorporateActionIntelligenceService } from '../CorporateActionIntelligenceService.ts';
import { cacheClear } from '../../market/marketDataCache.ts';

describe('Phase 23 — CorporateActionIntelligenceService', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('retrieves corporate action snapshot for HPG and adheres to PR-01 freshness', async () => {
    const snapshot = await CorporateActionIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-06-01',
    });

    expect(snapshot.symbol).toBe('HPG');
    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.dataLineage.engine).toBe('CorporateActionEngine');
    expect(snapshot.dataLineage.calculationVersion).toBe('23.0.0-PROD');
    expect(snapshot.historicalEvents.length).toBeGreaterThan(0);
  });

  it('serves cached snapshot within 60s TTL window and isolates keys by symbol', async () => {
    const snap1 = await CorporateActionIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-06-01',
    });

    const snap2 = await CorporateActionIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-06-01',
    });

    // Identical object reference from in-memory TTL cache
    expect(snap1).toBe(snap2);

    // Another symbol gets its own isolated cache entry
    const snapFpt = await CorporateActionIntelligenceService.getSnapshot('FPT', {
      asOfDate: '2024-06-01',
    });
    expect(snapFpt.symbol).toBe('FPT');
    expect(snapFpt).not.toBe(snap1);
  });

  it('bypasses cache when forceRefresh is requested', async () => {
    const snap1 = await CorporateActionIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-06-01',
    });

    const snap2 = await CorporateActionIntelligenceService.getSnapshot('HPG', {
      asOfDate: '2024-06-01',
      forceRefresh: true,
    });

    expect(snap1.symbol).toBe('HPG');
    expect(snap2.symbol).toBe('HPG');
    // Freshly generated object
    expect(snap2).not.toBe(snap1);
  });
});
