/**
 * PHASE 26 — REMEDIATION REGRESSION TESTS (P26-P2-1..P3-3)
 * ======================================================
 * Explicit evidence for every behavior change introduced during Phase 26
 * certification remediation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalCycleEngine } from '../CapitalCycleEngine.ts';
import { BacklogConversionEngine } from '../BacklogConversionEngine.ts';
import { BeneficiaryMappingEngine } from '../BeneficiaryMappingEngine.ts';
import { PolicyEventEngine } from '../PolicyEventEngine.ts';
import { StrategicProjectEngine } from '../StrategicProjectEngine.ts';
import { GovernanceEventEngine } from '../GovernanceEventEngine.ts';
import { EvidenceGraphEngine } from '../EvidenceGraphEngine.ts';
import { PolicyIntelligenceService } from '../../../services/capital-cycle/PolicyIntelligenceService.ts';
import { cacheClear } from '../../../services/market/marketDataCache.ts';
import {
  makeTestDrivers,
  makeTestPolicy,
  makeTestProject,
  makeTestBeneficiary,
  makeTestBacklogItem,
  makeTestGovernanceEvent,
} from './fixtures.ts';

describe('Phase 26 remediation — P2 analytical integrity', () => {
  it('P2-1: UNKNOWN stage carries a null score (never plottable 50)', () => {
    const result = CapitalCycleEngine.classifyStage({
      policySupportScore: null,
      publicInvestmentVelocity: null,
      privateCapexTrend: 'UNKNOWN',
      industryCapacityUtilizationPercent: null,
      averageGrossMarginTrend: 'UNKNOWN',
      industryBookToBillRatio: null,
      roicVsWaccSpreadPercent: null,
      industryCreditGrowthPercent: null,
    });
    expect(result.stage).toBe('UNKNOWN');
    expect(result.cycleScore).toBeNull();
  });

  it('P2-3: lone policy signal cannot assert EARLY_CYCLE (corroboration required)', () => {
    const lone = CapitalCycleEngine.classifyStage(
      makeTestDrivers({
        policySupportScore: 85,
        publicInvestmentVelocity: null,
        privateCapexTrend: 'UNKNOWN',
        industryCapacityUtilizationPercent: null,
        averageGrossMarginTrend: 'UNKNOWN',
        industryBookToBillRatio: null,
        roicVsWaccSpreadPercent: null,
      })
    );
    expect(lone.stage).toBe('UNKNOWN');
    expect(lone.cycleScore).toBeNull();

    const corroborated = CapitalCycleEngine.classifyStage(
      makeTestDrivers({
        policySupportScore: 85,
        publicInvestmentVelocity: null,
        privateCapexTrend: 'UNKNOWN',
        industryCapacityUtilizationPercent: 60,
        averageGrossMarginTrend: 'UNKNOWN',
        industryBookToBillRatio: null,
        roicVsWaccSpreadPercent: null,
      })
    );
    expect(corroborated.stage).toBe('EARLY_CYCLE');
    expect(corroborated.cycleScore).toBe(55);
  });

  it('P2-4: DISCLOSED_UNAUDITED backlog is segregated from confirmed totals', () => {
    const verified = makeTestBacklogItem({
      itemId: 'V1',
      remainingBacklogVnd: 4_000_000_000_000,
      verificationType: 'CONTRACTED_VERIFIED',
    });
    const unaudited = makeTestBacklogItem({
      itemId: 'U1',
      remainingBacklogVnd: 6_000_000_000_000,
      contractValueVnd: 6_000_000_000_000,
      verificationType: 'DISCLOSED_UNAUDITED',
    });
    const summary = BacklogConversionEngine.summarizeBacklog(
      'HHV',
      [verified, unaudited],
      2_000_000_000_000,
      '2024-08-01'
    );
    expect(summary.totalConfirmedBacklogVnd).toBe(4_000_000_000_000);
    expect(summary.totalUnauditedDisclosedBacklogVnd).toBe(6_000_000_000_000);
    // Coverage uses confirmed only: 4000/2000 = 2.0 (not 5000/2000).
    expect(summary.backlogCoverageYears).toBe(2.0);
  });

  it('P2-2: empty-source graph is not complete and sector root is provisional', () => {
    const graph = EvidenceGraphEngine.buildGraph({
      rootSectorId: 'materials',
      asOfDate: '2024-08-01',
      policies: [],
      projects: [],
      beneficiaries: [],
      backlogs: [],
    });
    expect(graph.isComplete).toBe(false);
    const sector = graph.nodes.find((n) => n.nodeType === 'SECTOR_NODE');
    expect(sector?.provenance.sourceTier).toBe('TIER_4_UNVERIFIED');
    expect(sector?.provenance.validationStatus).toBe('PROVISIONAL');
  });

  it('P2-2: backlog node provenance derives from real items (no ANNUAL_FILINGS synthesis)', () => {
    const item = makeTestBacklogItem({ symbol: 'HHV' });
    const summary = BacklogConversionEngine.summarizeBacklog('HHV', [item], 2_000_000_000_000, '2024-08-01');
    const graph = EvidenceGraphEngine.buildGraph({
      rootSectorId: 'materials',
      asOfDate: '2024-08-01',
      policies: [makeTestPolicy({ policyEventId: 'P1' })],
      projects: [],
      beneficiaries: [],
      backlogs: [summary],
    });
    expect(graph.isComplete).toBe(true);
    const backlogNode = graph.nodes.find((n) => n.nodeType === 'BACKLOG_NODE');
    expect(backlogNode?.provenance.source).not.toBe('ANNUAL_FILINGS');
    expect(backlogNode?.provenance.source).toContain('BCTC');
    expect(backlogNode?.provenance.sourceTier).toBe('TIER_1_STATUTORY');
  });
});

describe('Phase 26 remediation — P3 temporal integrity', () => {
  it('P3-1: undated policy/project/beneficiary/governance records are excluded', () => {
    const noDate: { publicationDate: string } = { publicationDate: '' };
    // A policy with neither publication nor announcement date is undatable.
    const undatedPolicy = makeTestPolicy({
      announcementDate: '',
      provenance: { ...makeTestPolicy().provenance, ...noDate },
    });
    const pol = PolicyEventEngine.filterPoliciesAsOf([undatedPolicy], {
      asOfDate: '2024-08-01',
      activeOnly: false,
    });
    expect(pol.validPolicies).toHaveLength(0);
    expect(pol.lookaheadViolations.length).toBeGreaterThan(0);

    const proj = StrategicProjectEngine.filterProjectsAsOf(
      [makeTestProject({ provenance: { ...makeTestProject().provenance, ...noDate } })],
      { asOfDate: '2024-08-01' }
    );
    expect(proj.validProjects).toHaveLength(0);

    const ben = BeneficiaryMappingEngine.filterBeneficiaries(
      [makeTestBeneficiary({ provenance: { ...makeTestBeneficiary().provenance, ...noDate }, awardDate: null })],
      { asOfDate: '2024-08-01' }
    );
    expect(ben.confirmedBeneficiaries).toHaveLength(0);

    const gov = GovernanceEventEngine.deriveGovernanceRiskStatus(
      'HHV',
      [makeTestGovernanceEvent({ provenance: { ...makeTestGovernanceEvent().provenance, ...noDate } })],
      '2024-08-01'
    );
    expect(gov.activeEvents).toHaveLength(0);
  });

  it('P3-2: future awardDate is rejected even with past publicationDate', () => {
    const summary = BacklogConversionEngine.summarizeBacklog(
      'HHV',
      [
        makeTestBacklogItem({
          remainingBacklogVnd: 5_000_000_000_000,
          awardDate: '2025-06-01',
          provenance: { ...makeTestBacklogItem().provenance, publicationDate: '2024-02-01' },
        }),
      ],
      2_000_000_000_000,
      '2024-08-01'
    );
    expect(summary.totalConfirmedBacklogVnd).toBeNull();
    expect(summary.items).toHaveLength(0);

    const ben = BeneficiaryMappingEngine.filterBeneficiaries(
      [
        makeTestBeneficiary({
          awardDate: '2025-06-01',
          provenance: { ...makeTestBeneficiary().provenance, publicationDate: '2024-02-01' },
        }),
      ],
      { asOfDate: '2024-08-01' }
    );
    expect(ben.confirmedBeneficiaries).toHaveLength(0);
    expect(ben.lookaheadViolations.length).toBeGreaterThan(0);
  });

  it('P3-3: historically-active policy survives present-status filtering via expiry window', () => {
    const expired = makeTestPolicy({
      status: 'EXPIRED',
      announcementDate: '2023-01-15',
      effectiveDate: '2023-02-01',
      expiryDate: '2024-06-30',
      provenance: { ...makeTestPolicy().provenance, publicationDate: '2023-01-20' },
    });
    // Historical snapshot inside the validity window keeps the policy…
    const historical = PolicyEventEngine.filterPoliciesAsOf([expired], { asOfDate: '2024-03-01' });
    expect(historical.validPolicies).toHaveLength(1);
    // …while a snapshot after expiry drops it.
    const after = PolicyEventEngine.filterPoliciesAsOf([expired], { asOfDate: '2024-09-01' });
    expect(after.validPolicies).toHaveLength(0);
  });

  it('P3-5: service snapshot carries end-to-end provenance (dedicated suite)', async () => {
    cacheClear();
    const snapshot = await PolicyIntelligenceService.getSnapshot({
      sectorId: 'materials',
      symbol: 'HHV',
      asOfDate: '2024-08-01',
      forceRefresh: true,
      data: {
        policies: [makeTestPolicy()],
        projects: [makeTestProject()],
        beneficiaries: [makeTestBeneficiary()],
        backlogItems: [makeTestBacklogItem()],
        governanceEvents: [makeTestGovernanceEvent()],
        capitalCycleDrivers: makeTestDrivers(),
        ttmRevenueVnd: 2_000_000_000_000,
        freshness: 'CURRENT',
        issues: [],
      },
    });
    // Policy provenance round-trips verbatim from source records.
    expect(snapshot.policyEvents[0].provenance.publicationDate).toBe('2024-01-10');
    expect(snapshot.policyEvents[0].provenance.sourceTier).toBe('TIER_1_STATUTORY');
    // Backlog segregation is visible at the service layer.
    expect(snapshot.backlogSummary?.totalConfirmedBacklogVnd).toBe(2_100_000_000_000);
    expect(snapshot.backlogSummary?.totalUnauditedDisclosedBacklogVnd).toBeNull();
    // Evidence graph root is structural-provisional, never statutory.
    const sector = snapshot.evidenceGraph?.nodes.find((n) => n.nodeType === 'SECTOR_NODE');
    expect(sector?.provenance.validationStatus).toBe('PROVISIONAL');
    cacheClear();
  });
});
