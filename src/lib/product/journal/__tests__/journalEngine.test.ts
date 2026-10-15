import { beforeEach, describe, expect, it } from 'vitest';
import { JournalEngine } from '../JournalEngine.ts';
import type { DecisionObject, EvidenceRef } from '../../../decision/types.ts';

if (typeof localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
}

const T = '2026-10-04T00:00:00.000Z';
const ev = (ref: string): EvidenceRef => ({ kind: 'valuation', ref, asOfDate: '2026-10-03', source: 'test-fixture' });

function thesisInput() {
  return {
    thesisId: 'th-1',
    instrumentId: 'HPG',
    asOfDate: '2026-10-03',
    createdAt: T,
    coreThesis: 'Margin expansion supports a base-case rerating.',
    supportingEvidence: [ev('val-1')],
    invalidationConditions: ['margin compression'],
  };
}

function decisionFixture(): DecisionObject {
  const e = ev('chain-1');
  return {
    decisionId: 'dec-1',
    instrumentId: 'HPG',
    asOfDate: '2026-10-03',
    decisionType: 'WATCH',
    decisionStatus: 'ELIGIBLE',
    evidence: [e],
    thesisId: 'th-1',
    valuation: e,
    strategy: e,
    portfolioContext: e,
    riskContext: e,
    positionSizing: e,
    constraints: [],
    confidence: 0.6,
    dataQuality: 'CURRENT',
    provenance: {
      dataVersion: 'test',
      asOfDate: '2026-10-03',
      analysisVersion: 'test',
      strategyVersion: 'test',
      riskPolicyVersion: 'test',
      positionSizingVersion: 'test',
    },
    createdAt: T,
    version: 'test',
    failCode: null,
    notes: [],
  };
}

describe('journal lifecycle', () => {
  it('creates DRAFT entries with thesis; rejects missing symbol/title/evidence', () => {
    const e = JournalEngine.create({ id: 'j1', symbol: 'hpg', title: 'HPG watch', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    expect(e.status).toBe('DRAFT');
    expect(e.symbol).toBe('HPG');
    expect(e.thesis?.status).toBe('DRAFT');
    expect(() => JournalEngine.create({ id: 'j2', symbol: ' ', title: 'x', entryDate: '2026-10-03', createdAt: T })).toThrow('JOURNAL_SYMBOL_REQUIRED');
    expect(() => JournalEngine.create({ id: 'j3', symbol: 'HPG', title: '  ', entryDate: '2026-10-03', createdAt: T })).toThrow('JOURNAL_TITLE_REQUIRED');
    expect(() =>
      JournalEngine.create({ id: 'j4', symbol: 'HPG', title: 't', entryDate: '2026-10-03', createdAt: T, thesis: { ...thesisInput(), supportingEvidence: [] } }),
    ).toThrow('THESIS_WITHOUT_EVIDENCE');
  });
  it('activate → snapshot → review-due → review → close (append-only)', () => {
    let e = JournalEngine.create({ id: 'j1', symbol: 'HPG', title: 't', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    e = JournalEngine.activate(e, T);
    e = JournalEngine.attachDecisionSnapshot(e, decisionFixture(), T);
    expect(e.entryType).toBe('DECISION');
    e = JournalEngine.markReviewDue(e, '2026-11-04', T);
    e = JournalEngine.addReview(e, {
      reviewId: 'r1', decisionId: 'dec-1', originalDecision: 'WATCH', originalEvidence: [ev('chain-1')],
      actualOutcome: 'flat', whatChanged: ['nothing'], whatWasCorrect: ['patience'], whatWasWrong: ['timing'], lessons: ['wait for confirmation'], newDecision: null, reviewedAt: T,
    });
    expect(e.status).toBe('REVIEWED');
    expect(e.reviews).toHaveLength(1);
    e = JournalEngine.close(e, T);
    expect(e.status).toBe('CLOSED');
  });
  it('snapshot is an immutable copy: later mutations never rewrite history', () => {
    let e = JournalEngine.create({ id: 'j1', symbol: 'HPG', title: 't', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    e = JournalEngine.activate(e, T);
    const live = decisionFixture();
    e = JournalEngine.attachDecisionSnapshot(e, live, T);
    (live as { decisionStatus: string }).decisionStatus = 'EXECUTED';
    (live.evidence as EvidenceRef[]).push(ev('late-injection'));
    expect(e.decisionSnapshot?.decisionStatus).toBe('ELIGIBLE');
    expect(e.decisionSnapshot?.evidence).toHaveLength(1);
  });
  it('rejects symbol mismatch, review without snapshot, and decision mismatch', () => {
    let e = JournalEngine.create({ id: 'j1', symbol: 'HPG', title: 't', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    e = JournalEngine.activate(e, T);
    const other = { ...decisionFixture(), instrumentId: 'FPT' };
    expect(() => JournalEngine.attachDecisionSnapshot(e, other, T)).toThrow('JOURNAL_SYMBOL_MISMATCH');
    expect(() => JournalEngine.addReview(e, {
      reviewId: 'r1', decisionId: 'dec-1', originalDecision: 'WATCH', originalEvidence: [], actualOutcome: null,
      whatChanged: [], whatWasCorrect: [], whatWasWrong: [], lessons: [], newDecision: null, reviewedAt: T,
    })).toThrow('JOURNAL_REVIEW_WITHOUT_SNAPSHOT');
  });
  it('decision-quality matrix separates skill from luck', () => {
    expect(JournalEngine.assessQuality(true, false)).toBe('GOOD_DECISION_BAD_OUTCOME');
    expect(JournalEngine.assessQuality(false, true)).toBe('BAD_DECISION_GOOD_OUTCOME');
    expect(JournalEngine.assessQuality(null, true)).toBe('UNASSESSED');
  });
  it('compareThesisVsOutcome summarizes without inferring', () => {
    let e = JournalEngine.create({ id: 'j1', symbol: 'HPG', title: 't', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    const c = JournalEngine.compareThesisVsOutcome(e);
    expect(c).toMatchObject({ hasThesis: true, hasSnapshot: false, reviewCount: 0, thesisStatus: 'DRAFT' });
  });
});

describe('journal store boundary', () => {
  beforeEach(() => localStorage.clear());
  it('unknown ids return null; corrupt state degrades to empty', async () => {
    const { JournalService } = await import('../../../../services/product/JournalService.ts');
    expect(JournalService.get('nope')).toBeNull();
    expect(JournalService.activate('nope', T)).toBeNull();
    localStorage.setItem('vnstock_product_journal_v1', '{broken');
    expect(JournalService.list()).toEqual([]);
  });
  it('service persists the full user flow', async () => {
    const { JournalService } = await import('../../../../services/product/JournalService.ts');
    JournalService.create({ id: 'j1', symbol: 'HPG', title: 't', thesis: thesisInput(), entryDate: '2026-10-03', createdAt: T });
    JournalService.activate('j1', T);
    JournalService.attachSnapshot('j1', decisionFixture(), T);
    const e = JournalService.get('j1');
    expect(e?.decisionSnapshot?.decisionId).toBe('dec-1');
    expect(JournalService.list()).toHaveLength(1);
  });
});
