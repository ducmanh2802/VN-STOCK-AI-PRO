import { describe, it, expect } from 'vitest';
import { GovernanceEventEngine } from '../GovernanceEventEngine.ts';
import { makeTestGovernanceEvent } from './fixtures.ts';

describe('Phase 26 — GovernanceEventEngine', () => {
  it('validates a correct legal governance event record', () => {
    const event = makeTestGovernanceEvent();
    const result = GovernanceEventEngine.validateEvent(event);
    expect(result.isValid).toBe(true);
    expect(result.validationStatus).toBe('VALID');
  });

  it('derives NO_MATERIAL_GOVERNANCE_EVENT when no active events exist', () => {
    const status = GovernanceEventEngine.deriveGovernanceRiskStatus('VNM', [], '2024-08-01');
    expect(status.riskStatus).toBe('NO_MATERIAL_GOVERNANCE_EVENT');
    expect(status.highestSeverity).toBeNull();
    expect(status.activeEvents).toHaveLength(0);
  });

  it('derives GOVERNANCE_EVENT for administrative level 2 events', () => {
    const event = makeTestGovernanceEvent({ severity: 'LEVEL_2_ADMINISTRATIVE' });
    const status = GovernanceEventEngine.deriveGovernanceRiskStatus('ABC', [event], '2024-08-01');
    expect(status.riskStatus).toBe('GOVERNANCE_EVENT');
    expect(status.highestSeverity).toBe('LEVEL_2_ADMINISTRATIVE');
  });

  it('derives CRITICAL_VERIFIED_GOVERNANCE_EVENT for level 4 criminal actions with block reason', () => {
    const criticalEvent = makeTestGovernanceEvent({
      severity: 'LEVEL_4_CRIMINAL_ACTION',
      title: 'Khởi tố và bắt tạm giam Chủ tịch HĐQT',
      authority: 'Cơ quan Cảnh sát Điều tra Bộ Công an',
    });

    const status = GovernanceEventEngine.deriveGovernanceRiskStatus('ABC', [criticalEvent], '2024-08-01');
    expect(status.riskStatus).toBe('CRITICAL_VERIFIED_GOVERNANCE_EVENT');
    expect(status.highestSeverity).toBe('LEVEL_4_CRIMINAL_ACTION');
    expect(status.blockReason).toBeDefined();
    expect(status.blockReason).toContain('CRITICAL GOVERNANCE RISK');
  });
});
