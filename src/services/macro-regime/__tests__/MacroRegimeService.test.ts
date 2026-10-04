import { describe, it, expect } from 'vitest';
import { MacroRegimeService } from '../MacroRegimeService.ts';

describe('Phase 27 — MacroRegimeService', () => {
  it('serves cached snapshot within 60s TTL window and isolates keys by asOfDate', async () => {
    const snap1 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30' });
    const snap2 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30' });
    expect(snap1.snapshotId).toBe(snap2.snapshotId);
    expect(snap1.macroRegime).toBe(snap2.macroRegime);
  });

  it('bypasses cache when forceRefresh is requested', async () => {
    const snap1 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30' });
    const snap2 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30', forceRefresh: true });
    expect(snap1.asOfDate).toBe(snap2.asOfDate);
  });

  it('evaluates custom observation overrides without mutating cache', async () => {
    const customSnapshot = await MacroRegimeService.getSnapshot({
      asOfDate: '2026-09-30',
      observationsOverride: [],
    });
    expect(customSnapshot.macroRegime).toBe('UNKNOWN');
    expect(customSnapshot.dataCoverage).toBe('INSUFFICIENT');
  });
});
