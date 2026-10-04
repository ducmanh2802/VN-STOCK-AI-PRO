import { describe, it, expect } from 'vitest';
import { PolicyEventEngine } from '../PolicyEventEngine.ts';
import { makeTestPolicy } from './fixtures.ts';

describe('Phase 26 — PolicyEventEngine', () => {
  it('validates a correct statutory policy event', () => {
    const policy = makeTestPolicy();
    const result = PolicyEventEngine.validatePolicy(policy);
    expect(result.isValid).toBe(true);
    expect(result.validationStatus).toBe('VALID');
    expect(result.errors).toHaveLength(0);
  });

  it('fails validation when document number or title is missing', () => {
    const invalid = makeTestPolicy({ documentNumber: '', title: '' });
    const result = PolicyEventEngine.validatePolicy(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing official document number / resolution ID');
    expect(result.errors).toContain('Missing policy title');
  });

  it('enforces lookahead protection on evaluation asOfDate', () => {
    const futurePolicy = makeTestPolicy({
      announcementDate: '2025-06-01',
      provenance: {
        ...makeTestPolicy().provenance,
        publicationDate: '2025-06-01',
      },
    });

    const pastPolicy = makeTestPolicy({
      announcementDate: '2023-01-01',
      provenance: {
        ...makeTestPolicy().provenance,
        publicationDate: '2023-01-01',
      },
    });

    const filtered = PolicyEventEngine.filterPoliciesAsOf([futurePolicy, pastPolicy], {
      asOfDate: '2024-01-01',
    });

    expect(filtered.validPolicies).toHaveLength(1);
    expect(filtered.lookaheadViolations.length).toBeGreaterThan(0);
    expect(filtered.filteredCount).toBe(1);
  });

  it('computes sector policy intensity score bounded within [0, 100]', () => {
    const p1 = makeTestPolicy({ affectedSectors: ['energy'] });
    const p2 = makeTestPolicy({
      policyEventId: 'POL_02',
      documentNumber: '500/QĐ-TTg',
      affectedSectors: ['energy'],
      issuingAuthority: 'PRIME_MINISTER',
    });

    const intensity = PolicyEventEngine.computeSectorPolicyIntensity('energy', [p1, p2]);
    expect(intensity.activePolicyCount).toBe(2);
    expect(intensity.supportScore).toBeGreaterThanOrEqual(0);
    expect(intensity.supportScore).toBeLessThanOrEqual(100);
    expect(intensity.freshness).toBe('CURRENT');
  });

  it('returns UNAVAILABLE and 0 score when no policies match sector', () => {
    const intensity = PolicyEventEngine.computeSectorPolicyIntensity('banking', []);
    expect(intensity.activePolicyCount).toBe(0);
    expect(intensity.supportScore).toBe(0);
    expect(intensity.totalTargetCapitalVnd).toBeNull();
    expect(intensity.freshness).toBe('UNAVAILABLE');
  });
});
