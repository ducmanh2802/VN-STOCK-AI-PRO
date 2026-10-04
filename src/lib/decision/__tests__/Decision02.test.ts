/**
 * DECISION-02 TESTS — thesis, evidence linking, scenarios, invalidation, lifecycle, immutability
 */
import { describe, it, expect } from 'vitest';
import { ThesisEngine } from '../ThesisEngine.ts';

function ev(ref: string) {
  return { kind: 'metric', ref, asOfDate: '2026-10-01', source: 'earnings' };
}

describe('ThesisEngine', () => {
  it('creates evidence-linked thesis as DRAFT', () => {
    const t = ThesisEngine.create({
      thesisId: 't1', instrumentId: 'VN-HOSE-HPG', asOfDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z',
      coreThesis: 'Margin expansion + backlog conversion.',
      supportingEvidence: [ev('ROE 22%'), ev('backlog +30%')],
      invalidationConditions: ['Margin Compression', 'unsupported vibes'],
      scenarios: [{ name: 'BASE', assumptions: ['stable demand'], drivers: ['capex'], risks: ['rates'], valuationImplication: '+15%', probability: 0.6 }],
    });
    expect(t.status).toBe('DRAFT');
    expect(t.invalidationConditions).toEqual(['Margin Compression']);
    expect(t.scenarios[0].probability).toBe(0.6);
    expect(t.history.length).toBe(1);
  });

  it('rejects evidence-free thesis and invented probabilities', () => {
    expect(() =>
      ThesisEngine.create({
        thesisId: 't', instrumentId: 'i', asOfDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z',
        coreThesis: 'Company looks good.', supportingEvidence: [],
      })
    ).toThrow('THESIS_WITHOUT_EVIDENCE');
    expect(() =>
      ThesisEngine.create({
        thesisId: 't', instrumentId: 'i', asOfDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z',
        coreThesis: 'x', supportingEvidence: [ev('m')],
        scenarios: [{ name: 'BULL', assumptions: [], drivers: [], risks: [], valuationImplication: null, probability: 5 }],
      })
    ).toThrow('INVALID_PROBABILITY');
  });

  it('enforces lifecycle and preserves history immutably', () => {
    const t = ThesisEngine.create({
      thesisId: 't1', instrumentId: 'i', asOfDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z',
      coreThesis: 'x', supportingEvidence: [ev('m')],
    });
    const a = ThesisEngine.transition(t, 'ACTIVE', '2026-10-02T00:00:00Z', 'activated');
    expect(a.status).toBe('ACTIVE');
    expect(a.history.length).toBe(2);
    expect(t.history.length).toBe(1);
    expect(() => ThesisEngine.transition(t, 'CONFIRMED', '2026-10-03T00:00:00Z', 'skip')).toThrow();
  });
});
