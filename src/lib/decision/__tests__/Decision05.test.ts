/**
 * DECISION-05 TESTS — triggers, invalidation, breach, review, preservation, false triggers
 */
import { describe, it, expect } from 'vitest';
import { MonitoringEngine, ReviewEngine } from '../MonitoringEngine.ts';

const QUIET = {
  decisionId: 'd1', thesisInvalidated: false, riskLimitBreached: false, targetReached: false,
  stopTriggered: false, valuationChanged: false, fundamentalChanged: false,
  macroChanged: false, industryChanged: false, dataInvalid: false, positionChanged: false,
};

describe('MonitoringEngine', () => {
  it('detects each trigger condition', () => {
    expect(MonitoringEngine.detect({ ...QUIET, thesisInvalidated: true })).toContain('THESIS_INVALIDATED');
    expect(MonitoringEngine.detect({ ...QUIET, riskLimitBreached: true })).toContain('RISK_LIMIT_BREACHED');
    expect(MonitoringEngine.detect({ ...QUIET, stopTriggered: true })).toContain('STOP_TRIGGERED');
    expect(MonitoringEngine.detect({ ...QUIET, macroChanged: true })).toContain('MACRO_CHANGED');
    expect(MonitoringEngine.detect(QUIET)).toEqual([]);
  });

  it('suppresses non-data triggers when data is invalid (false-trigger prevention)', () => {
    const triggers = MonitoringEngine.detect({ ...QUIET, targetReached: true, dataInvalid: true });
    expect(MonitoringEngine.falseTriggerGuard(triggers, true)).toEqual(['DATA_INVALID']);
  });
});

describe('ReviewEngine', () => {
  it('creates immutable review preserving originals', () => {
    const r = ReviewEngine.create({
      reviewId: 'r1', decisionId: 'd1', originalDecision: 'BUY',
      originalEvidence: [{ kind: 'val', ref: 'v', asOfDate: '2026-10-01', source: 's' }],
      actualOutcome: '+12% in 3M', whatChanged: ['rates cut'], whatWasCorrect: ['thesis'],
      whatWasWrong: ['timing'], lessons: ['scale in'], newDecision: 'HOLD',
      reviewedAt: '2026-10-04T00:00:00Z',
    });
    expect(r.newDecision).toBe('HOLD');
    expect(r.originalDecision).toBe('BUY');
  });

  it('requires identity', () => {
    expect(() =>
      ReviewEngine.create({
        reviewId: '', decisionId: 'd1', originalDecision: 'BUY', originalEvidence: [],
        actualOutcome: null, whatChanged: [], whatWasCorrect: [], whatWasWrong: [],
        lessons: [], newDecision: null, reviewedAt: '2026-10-04T00:00:00Z',
      })
    ).toThrow();
  });
});
