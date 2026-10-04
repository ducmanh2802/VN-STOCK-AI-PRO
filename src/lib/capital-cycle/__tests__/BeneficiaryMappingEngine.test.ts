import { describe, it, expect } from 'vitest';
import { BeneficiaryMappingEngine } from '../BeneficiaryMappingEngine.ts';
import { makeTestBeneficiary } from './fixtures.ts';

describe('Phase 26 — BeneficiaryMappingEngine', () => {
  it('correctly maps confirmed contractor relationships from official tender awards', () => {
    const ben = makeTestBeneficiary();
    const result = BeneficiaryMappingEngine.filterBeneficiaries([ben], {
      asOfDate: '2026-10-01',
      symbol: 'HHV',
    });

    expect(result.confirmedBeneficiaries).toHaveLength(1);
    expect(result.confirmedBeneficiaries[0].isConfirmedBeneficiary).toBe(true);
    expect(result.totalConfirmedContractValueVnd).toBe(3800000000000);
    expect(result.rejectedRumorsCount).toBe(0);
  });

  it('strictly excludes rumors and unverified secondary sources from confirmed backlog values', () => {
    const rumor = makeTestBeneficiary({
      relationshipId: 'RUMOR_01',
      evidenceTier: 'RUMOR',
      role: 'POTENTIAL_BENEFICIARY',
      confirmedBacklogShareVnd: 5000000000000,
    });

    const result = BeneficiaryMappingEngine.filterBeneficiaries([rumor], {
      asOfDate: '2026-10-01',
      symbol: 'HHV',
    });

    expect(result.confirmedBeneficiaries).toHaveLength(0);
    expect(result.unconfirmedBeneficiaries).toHaveLength(1);
    expect(result.unconfirmedBeneficiaries[0].confirmedBacklogShareVnd).toBeNull();
    expect(result.totalConfirmedContractValueVnd).toBeNull();
    expect(result.rejectedRumorsCount).toBe(1);
  });

  it('summarizes company project exposures accurately', () => {
    const ben = makeTestBeneficiary({ role: 'DIRECT_CONTRACTOR' });
    const summary = BeneficiaryMappingEngine.summarizeCompanyProjectExposure('HHV', [ben]);

    expect(summary.symbol).toBe('HHV');
    expect(summary.confirmedProjectCount).toBe(1);
    expect(summary.highestRole).toBe('DIRECT_CONTRACTOR');
    expect(summary.freshness).toBe('CURRENT');
  });
});
