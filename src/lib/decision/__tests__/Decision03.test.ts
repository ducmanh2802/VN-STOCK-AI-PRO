/**
 * DECISION-03 TESTS — risk pass/fail/missing/conflicts/concentration/fail-closed
 */
import { describe, it, expect } from 'vitest';
import { RiskDecisionEngine } from '../RiskDecisionEngine.ts';

const V = 'policy-v1';
const T = '2026-10-01T00:00:00Z';

describe('RiskDecisionEngine', () => {
  it('passes authorized clean evaluation as ACCEPTABLE', () => {
    const r = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'VALID', authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      hardBreaches: [], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T,
    });
    expect(r.state).toBe('ACCEPTABLE');
  });

  it('warns on soft warnings (CAUTION) without blocking', () => {
    const r = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'VALID', authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      hardBreaches: [], softWarnings: ['high volatility'], riskPolicyVersion: V, evaluatedAt: T,
    });
    expect(r.state).toBe('CAUTION');
  });

  it('blocks on RiskGuard BLOCKED and on hard breaches', () => {
    const a = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'BLOCKED', authorization: 'BLOCKED',
      hardBreaches: [], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T,
    });
    expect(a.state).toBe('BLOCKED');
    const b = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'VALID', authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      hardBreaches: ['max position breached'], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T,
    });
    expect(b.state).toBe('BLOCKED');
  });

  it('derives hard breaches from concentration/sector/leverage/margin/drawdown flags', () => {
    const r = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'VALID', authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      hardBreaches: [], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T,
      portfolioFlags: { concentrationBreach: true, leverageBreach: true },
    });
    expect(r.state).toBe('BLOCKED');
    expect(r.hardBreaches.length).toBe(2);
  });

  it('fail-closes missing/invalid risk as UNKNOWN', () => {
    const r = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'INVALID', authorization: 'INVALID',
      hardBreaches: [], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T, missingRisk: true,
    });
    expect(r.state).toBe('UNKNOWN');
  });

  it('marks unauthorized-but-valid as HIGH_RISK', () => {
    const r = RiskDecisionEngine.evaluate({
      riskGuardStatus: 'VALID', authorization: 'INVALID',
      hardBreaches: [], softWarnings: [], riskPolicyVersion: V, evaluatedAt: T,
    });
    expect(r.state).toBe('HIGH_RISK');
  });
});
