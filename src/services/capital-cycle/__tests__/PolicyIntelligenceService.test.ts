import { describe, it, expect } from 'vitest';
import { PolicyIntelligenceService } from '../PolicyIntelligenceService.ts';

describe('Phase 26 — PolicyIntelligenceService', () => {
  it('builds a complete cached snapshot for a sector and symbol', async () => {
    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'energy',
      symbol: 'PC1',
      forceRefresh: true,
    });

    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.sectorId).toBe('energy');
    expect(snapshot.symbol).toBe('PC1');
    expect(snapshot.policyEvents.length).toBeGreaterThan(0);
    expect(snapshot.strategicProjects.length).toBeGreaterThan(0);
    expect(snapshot.capitalCycleSnapshot).toBeDefined();
    expect(snapshot.evidenceGraph).toBeDefined();
    expect(snapshot.freshness).toBe('CURRENT');
  });

  it('serves cached snapshot on subsequent calls without forceRefresh', async () => {
    const s1 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HPG',
      forceRefresh: true,
    });

    const s2 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HPG',
      forceRefresh: false,
    });

    expect(s1.snapshotId).toBe(s2.snapshotId);
  });
});
