/**
 * REPLAY TESTS 1 — DATA MATRIX + MANIFEST + STATE MACHINE + PIT/SURVIVORSHIP
 */
import { describe, it, expect } from 'vitest';
import { ReplayManifestEngine, manifestFingerprint } from '../ReplayManifest.ts';
import { ReplayStateMachine, ReplayEventLog } from '../ReplayStateMachine.ts';

function mf(over?: Partial<Parameters<typeof ReplayManifestEngine.create>[0]>) {
  return ReplayManifestEngine.create({
    replayId: 'R1', createdAt: '2026-10-04T00:00:00Z', datasetId: 'D1', datasetVersion: 'dv1',
    strategyId: 'S1', strategyVersion: 'sv1', decisionVersion: 'dv-os', riskModelVersion: 'rmv1',
    positionSizingVersion: 'psv1', executionModelVersion: 'emv1', costModelVersion: 'cmv1',
    universe: ['VN-HOSE-HPG'], startDate: '2024-01-02', endDate: '2024-01-31',
    initialCapital: 100000000, mode: 'HISTORICAL_REPLAY', configuration: { lookback: 20 },
    ...over,
  });
}

describe('ReplayManifestEngine', () => {
  it('creates an immutable reproducible manifest', () => {
    const a = mf();
    const b = mf();
    expect(manifestFingerprint(a)).toBe(manifestFingerprint(b));
    expect(ReplayManifestEngine.reproducible(a, b)).toBe(true);
    expect(a.currency).toBe('VND');
    expect(a.pointInTimePolicy).toContain('publicationDate');
  });

  it('rejects invalid manifests (range/capital/universe)', () => {
    expect(() => mf({ startDate: '2024-02-01', endDate: '2024-01-01' })).toThrow('INVERTED_RANGE');
    expect(() => mf({ initialCapital: 0 })).toThrow('INVALID_INITIAL_CAPITAL');
    expect(() => mf({ universe: [] })).toThrow('EMPTY_UNIVERSE');
    expect(() => mf({ replayId: '' })).toThrow('REPLAY_ID_REQUIRED');
  });

  it('changes fingerprint when versions change', () => {
    expect(manifestFingerprint(mf())).not.toBe(manifestFingerprint(mf({ strategyVersion: 'sv2' })));
  });
});

describe('ReplayStateMachine', () => {
  it('follows the lifecycle and forbids skipping', () => {
    let s = ReplayStateMachine.transition('CREATED', 'VALIDATING');
    s = ReplayStateMachine.transition(s, 'READY');
    s = ReplayStateMachine.transition(s, 'RUNNING');
    s = ReplayStateMachine.transition(s, 'PAUSED');
    s = ReplayStateMachine.transition(s, 'RUNNING');
    expect(s).toBe('RUNNING');
    expect(() => ReplayStateMachine.transition('CREATED', 'RUNNING')).toThrow();
  });

  it('treats failure states as terminal (never completed)', () => {
    for (const t of ['FAILED', 'CANCELLED', 'DATA_UNAVAILABLE', 'RISK_BLOCKED', 'EXECUTION_BLOCKED'] as const) {
      expect(ReplayStateMachine.isTerminal(t)).toBe(true);
    }
    expect(ReplayStateMachine.isTerminal('RUNNING')).toBe(false);
  });
});

describe('ReplayEventLog', () => {
  it('is ordered, idempotent, and counts event types', () => {
    const log = new ReplayEventLog();
    const base = { replayId: 'R1', provenance: 'test', payload: {} as Record<string, string> };
    expect(log.append({ ...base, eventId: 'E1', effectiveDate: '2024-01-02', eventType: 'SESSION_START' }).accepted).toBe(true);
    expect(log.append({ ...base, eventId: 'E1', effectiveDate: '2024-01-02', eventType: 'SESSION_START' }).accepted).toBe(false);
    expect(log.append({ ...base, eventId: 'E2', effectiveDate: '2024-01-02', eventType: 'FILL' }).accepted).toBe(true);
    expect(log.isOrdered()).toBe(true);
    expect(log.countOf('FILL')).toBe(1);
  });
});