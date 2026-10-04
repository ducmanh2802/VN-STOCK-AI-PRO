/**
 * PHASE 26 — TEMPORAL / LOOKAHEAD INTEGRITY TESTS
 * ==============================================
 * Proves that information unavailable as of the requested observation date can
 * NEVER influence a historical Phase 26 snapshot.
 */

import { describe, it, expect } from 'vitest';
import { PolicyIntelligenceService } from '../PolicyIntelligenceService.ts';
import type { CapitalCycleRawData } from '../CapitalCycleDataProvider.ts';
import {
  makeTestPolicy,
  makeTestProject,
  makeTestBeneficiary,
  makeTestBacklogItem,
  makeTestGovernanceEvent,
  makeTestDrivers,
} from '../../../lib/capital-cycle/__tests__/fixtures.ts';

function base(overrides?: Partial<CapitalCycleRawData>): CapitalCycleRawData {
  return {
    policies: [],
    projects: [],
    beneficiaries: [],
    backlogItems: [],
    governanceEvents: [],
    capitalCycleDrivers: makeTestDrivers(),
    ttmRevenueVnd: null,
    freshness: 'CURRENT',
    issues: [],
    ...overrides,
  };
}

describe('Phase 26 — Temporal / lookahead integrity', () => {
  it('excludes a future policy event published after the asOfDate', async () => {
    const futurePolicy = makeTestPolicy({
      policyEventId: 'FUTURE_POLICY',
      announcementDate: '2027-01-01',
      provenance: { ...makeTestPolicy().provenance, publicationDate: '2027-01-01' },
    });
    const pastPolicy = makeTestPolicy({ policyEventId: 'PAST_POLICY' });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ policies: [futurePolicy, pastPolicy] }),
    });

    expect(snapshot.policyEvents.some((p) => p.policyEventId === 'FUTURE_POLICY')).toBe(false);
    expect(snapshot.policyEvents.some((p) => p.policyEventId === 'PAST_POLICY')).toBe(true);
    expect(snapshot.lookaheadRejected).toBe(true);
  });

  it('excludes a future strategic project milestone announced after the asOfDate', async () => {
    const futureProject = makeTestProject({
      projectId: 'FUTURE_PROJECT',
      provenance: { ...makeTestProject().provenance, publicationDate: '2027-03-01' },
    });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ projects: [futureProject] }),
    });

    expect(snapshot.strategicProjects).toHaveLength(0);
    expect(snapshot.lookaheadRejected).toBe(true);
  });

  it('excludes a future beneficiary award (contract awarded after the asOfDate)', async () => {
    const futureBeneficiary = makeTestBeneficiary({
      relationshipId: 'FUTURE_BEN',
      awardDate: '2027-06-01',
      provenance: { ...makeTestBeneficiary().provenance, publicationDate: '2027-06-01' },
    });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      symbol: 'HHV',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ beneficiaries: [futureBeneficiary] }),
    });

    expect(snapshot.confirmedBeneficiaries).toHaveLength(0);
  });

  it('excludes a future governance event so it cannot raise historical risk', async () => {
    const futureGovernance = makeTestGovernanceEvent({
      eventId: 'FUTURE_GOV',
      symbol: 'ABC',
      severity: 'LEVEL_4_CRIMINAL_ACTION',
      provenance: { ...makeTestGovernanceEvent().provenance, publicationDate: '2027-06-01' },
    });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      symbol: 'ABC',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ governanceEvents: [futureGovernance] }),
    });

    expect(snapshot.governanceEvents).toHaveLength(0);
    expect(snapshot.governanceRiskStatus).toBe('NO_MATERIAL_GOVERNANCE_EVENT');
  });

  it('includes an event published exactly at the asOfDate (boundary)', async () => {
    const boundaryPolicy = makeTestPolicy({
      policyEventId: 'BOUNDARY_POLICY',
      announcementDate: '2026-06-01',
      provenance: { ...makeTestPolicy().provenance, publicationDate: '2026-06-01' },
    });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ policies: [boundaryPolicy] }),
    });

    expect(snapshot.policyEvents.some((p) => p.policyEventId === 'BOUNDARY_POLICY')).toBe(true);
    expect(snapshot.lookaheadRejected).toBe(false);
  });

  it('does not leak future backlog (award date after asOfDate) into historical backlog', async () => {
    const futureBacklog = makeTestBacklogItem({
      itemId: 'FUTURE_BL',
      awardDate: '2027-01-01',
      provenance: { ...makeTestBacklogItem().provenance, publicationDate: '2027-01-01' },
    });

    const snapshot = await PolicyIntelligenceService.getSnapshot({
      symbol: 'HHV',
      asOfDate: '2026-06-01',
      forceRefresh: true,
      data: base({ backlogItems: [futureBacklog], ttmRevenueVnd: 1_000_000_000_000 }),
    });

    expect(snapshot.backlogSummary?.totalConfirmedBacklogVnd ?? null).toBeNull();
  });
});
