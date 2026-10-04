/**
 * DECISION-01 TESTS — chain, missing/stale/invalid, conflicts, HOLD, blocked, determinism
 */
import { describe, it, expect } from 'vitest';
import { DecisionChainBuilder, type DecisionChainInput } from '../DecisionChainBuilder.ts';

function ev(kind: string) {
  return { kind, ref: kind, asOfDate: '2026-10-01', source: 'TEST' };
}

function base(over?: Partial<DecisionChainInput>): DecisionChainInput {
  return {
    decisionId: 'd1', instrumentId: 'VN-HOSE-HPG', asOfDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z',
    strategyDirection: 'LONG', proposedType: 'BUY', confidence: 80,
    data: { evidence: ev('data') }, validation: { evidence: ev('validation') },
    macro: { evidence: ev('macro') }, industry: { evidence: ev('industry') },
    fundamentals: { evidence: ev('fund') }, valuation: { evidence: ev('val') },
    strategy: { evidence: ev('strat') }, portfolio: { evidence: ev('port') },
    risk: { evidence: ev('risk') }, sizing: { evidence: ev('size') },
    provenance: {
      dataVersion: 'v1', asOfDate: '2026-10-01', analysisVersion: 'v1',
      strategyVersion: 'v25', riskPolicyVersion: 'v1', positionSizingVersion: 'v1',
    },
    ...over,
  };
}

describe('DecisionChainBuilder', () => {
  it('builds complete chain as ELIGIBLE', () => {
    const d = DecisionChainBuilder.build(base());
    expect(d.decisionStatus).toBe('ELIGIBLE');
    expect(d.decisionType).toBe('BUY');
    expect(d.failCode).toBeNull();
    expect(d.evidence.length).toBe(10);
  });

  it('fail-closes on missing critical risk', () => {
    const d = DecisionChainBuilder.build(base({ risk: { evidence: null } }));
    expect(d.decisionStatus).toBe('BLOCKED');
    expect(d.failCode).toBe('RISK_UNAVAILABLE');
  });

  it('fail-closes on missing critical data with custom code', () => {
    const d = DecisionChainBuilder.build(base({ data: { evidence: null, unavailableCode: 'DATA_UNAVAILABLE' } }));
    expect(d.decisionStatus).toBe('BLOCKED');
    expect(d.failCode).toBe('DATA_UNAVAILABLE');
  });

  it('tolerates missing non-critical macro as note', () => {
    const d = DecisionChainBuilder.build(base({ macro: { evidence: null } }));
    expect(d.decisionStatus).toBe('ELIGIBLE');
    expect(d.notes.join(' ')).toMatch(/macro/);
  });

  it('blocks on explicit blocker', () => {
    const d = DecisionChainBuilder.build(base({ risk: { evidence: ev('risk'), blocker: 'DAILY_LOSS_LIMIT' } }));
    expect(d.decisionStatus).toBe('BLOCKED');
    expect(d.constraints).toContain('DAILY_LOSS_LIMIT');
  });

  it('preserves HOLD (never upgrades to BUY)', () => {
    const d = DecisionChainBuilder.build(base({ strategyDirection: 'HOLD', proposedType: 'BUY' }));
    expect(d.decisionType).toBe('HOLD');
  });

  it('maps FLAT upgrade to AVOID', () => {
    const d = DecisionChainBuilder.build(base({ strategyDirection: 'FLAT', proposedType: 'SELL' }));
    expect(d.decisionType).toBe('AVOID');
  });

  it('is deterministic', () => {
    const a = DecisionChainBuilder.build(base());
    const b = DecisionChainBuilder.build(base());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
