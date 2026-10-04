/**
 * PHASE 26 — POLICY INTELLIGENCE SERVICE TESTS
 * ============================================
 * Verifies real-data orchestration, provenance, cache isolation and fail-closed
 * behaviour. Data is injected via the documented CapitalCycleDataSource contract
 * (never hardcoded inside the service).
 */

import { describe, it, expect } from 'vitest';
import { PolicyIntelligenceService } from '../PolicyIntelligenceService.ts';
import {
  emptyCapitalCycleData,
  type CapitalCycleRawData,
  type CapitalCycleDataSource,
} from '../CapitalCycleDataProvider.ts';
import {
  makeTestPolicy,
  makeTestProject,
  makeTestBeneficiary,
  makeTestBacklogItem,
  makeTestDrivers,
} from '../../../lib/capital-cycle/__tests__/fixtures.ts';

const AS_OF = '2026-10-01';

function rawData(overrides?: Partial<CapitalCycleRawData>): CapitalCycleRawData {
  return {
    policies: [makeTestPolicy()],
    projects: [makeTestProject()],
    beneficiaries: [makeTestBeneficiary()],
    backlogItems: [makeTestBacklogItem()],
    governanceEvents: [],
    capitalCycleDrivers: makeTestDrivers(),
    ttmRevenueVnd: 3_800_000_000_000,
    freshness: 'CURRENT',
    issues: [],
    ...overrides,
  };
}

describe('Phase 26 — PolicyIntelligenceService', () => {
  it('builds a complete, provenance-backed snapshot from injected real data', async () => {
    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: AS_OF,
      forceRefresh: true,
      data: rawData(),
    });

    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.sectorId).toBe('materials');
    expect(snapshot.symbol).toBe('HHV');
    expect(snapshot.policyEvents.length).toBeGreaterThan(0);
    expect(snapshot.strategicProjects.length).toBeGreaterThan(0);
    expect(snapshot.capitalCycleSnapshot).toBeDefined();
    expect(snapshot.capitalCycleSnapshot?.stage).toBeDefined();
    expect(snapshot.evidenceGraph).toBeDefined();
    expect(snapshot.freshness).toBe('CURRENT');

    // Provenance is carried from the source records (not synthesised).
    const policy = snapshot.policyEvents[0];
    expect(policy.provenance.source).toBeTruthy();
    expect(policy.provenance.publicationDate).toBe('2024-01-10');
    expect(policy.provenance.sourceTier).toBe('TIER_1_STATUTORY');
  });

  it('serves cached snapshot on subsequent calls without forceRefresh', async () => {
    const s1 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: AS_OF,
      forceRefresh: true,
      data: rawData(),
    });
    const s2 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: AS_OF,
      forceRefresh: false,
      data: rawData(),
    });

    expect(s1.snapshotId).toBe(s2.snapshotId);
  });

  it('isolates cache keys by asOfDate (cross-date contamination is impossible)', async () => {
    const s1 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: '2026-10-01',
      forceRefresh: true,
      data: rawData(),
    });
    const s2 = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: '2026-10-02',
      forceRefresh: false,
      data: rawData(),
    });

    expect(s1.snapshotId).not.toBe(s2.snapshotId);
  });

  it('fails closed (UNAVAILABLE) when the source has no persisted records', async () => {
    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'energy',
      symbol: 'PC1',
      asOfDate: AS_OF,
      forceRefresh: true,
      data: emptyCapitalCycleData('NO_PERSISTED_PHASE26_RECORDS'),
    });

    expect(snapshot.policyEvents).toHaveLength(0);
    expect(snapshot.strategicProjects).toHaveLength(0);
    expect(snapshot.capitalCycleSnapshot).toBeNull();
    expect(snapshot.freshness).toBe('UNAVAILABLE');
    expect(snapshot.governanceRiskStatus).toBe('NO_MATERIAL_GOVERNANCE_EVENT');
  });

  it('fails closed when the data source throws (provider failure)', async () => {
    const failing: CapitalCycleDataSource = {
      fetch: async () => {
        throw new Error('persistence unreachable');
      },
    };

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      asOfDate: AS_OF,
      forceRefresh: true,
      dataSource: failing,
    });

    expect(snapshot.policyEvents).toHaveLength(0);
    expect(snapshot.freshness).toBe('UNAVAILABLE');
  });
});
