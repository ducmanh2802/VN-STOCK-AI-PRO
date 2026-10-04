import { describe, it, expect } from 'vitest';
import { PolicyEventEngine } from '../PolicyEventEngine.ts';
import { StrategicProjectEngine } from '../StrategicProjectEngine.ts';
import { BeneficiaryMappingEngine } from '../BeneficiaryMappingEngine.ts';
import { BacklogConversionEngine } from '../BacklogConversionEngine.ts';
import { CapitalCycleEngine } from '../CapitalCycleEngine.ts';
import { GovernanceEventEngine } from '../GovernanceEventEngine.ts';
import {
  makeTestPolicy,
  makeTestProject,
  makeTestBeneficiary,
  makeTestBacklogItem,
  makeTestGovernanceEvent,
} from './fixtures.ts';

describe('Phase 26 — Fail-Closed Integrity Matrix', () => {
  it('fails closed when policy has invalid/missing numbers or unverified source', () => {
    const corruptedPolicy = makeTestPolicy({
      targetInvestmentVnd: -5000,
      provenance: {
        ...makeTestPolicy().provenance,
        sourceTier: 'TIER_4_UNVERIFIED',
      },
    });

    const validation = PolicyEventEngine.validatePolicy(corruptedPolicy);
    expect(validation.isValid).toBe(false);
    expect(validation.validationStatus).toBe('INVALID');
  });

  it('fails closed when strategic project has invalid progress percent', () => {
    const corruptedProject = makeTestProject({ progressPercent: NaN });
    const validation = StrategicProjectEngine.validateProject(corruptedProject);
    expect(validation.isValid).toBe(false);
  });

  it('fails closed by stripping contract backlog share from rumor beneficiaries', () => {
    const rumor = makeTestBeneficiary({
      evidenceTier: 'RUMOR',
      confirmedBacklogShareVnd: 10000000000000,
    });

    const result = BeneficiaryMappingEngine.filterBeneficiaries([rumor]);
    expect(result.confirmedBeneficiaries).toHaveLength(0);
    expect(result.unconfirmedBeneficiaries[0].confirmedBacklogShareVnd).toBeNull();
  });

  it('fails closed when backlog revenue projection encounters missing or negative backlog', () => {
    const summary = BacklogConversionEngine.summarizeBacklog('HHV', [], null);
    const projection = BacklogConversionEngine.projectRevenueConversion(summary);

    expect(projection.conversionStatus).toBe('UNAVAILABLE');
    expect(projection.confirmedBacklogVnd).toBeNull();
    expect(projection.projectedRevenues).toHaveLength(0);
  });

  it('fails closed to UNKNOWN stage when capital cycle drivers are empty/null', () => {
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
    // Remediated (P26-P2-1): UNKNOWN carries a null score — never a plottable 50.
    expect(result.cycleScore).toBeNull();
  });

  it('fails closed to CRITICAL_VERIFIED_GOVERNANCE_EVENT when Level 4 criminal action is active', () => {
    const event = makeTestGovernanceEvent({
      severity: 'LEVEL_4_CRIMINAL_ACTION',
      status: 'OFFICIAL_SANCTION',
    });

    const status = GovernanceEventEngine.deriveGovernanceRiskStatus('ABC', [event]);
    expect(status.riskStatus).toBe('CRITICAL_VERIFIED_GOVERNANCE_EVENT');
    expect(status.blockReason).toBeDefined();
  });
});
