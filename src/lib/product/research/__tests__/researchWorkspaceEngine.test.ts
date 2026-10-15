import { describe, expect, it } from 'vitest';
import { ResearchWorkspaceEngine as E } from '../ResearchWorkspaceEngine.ts';
import { JournalEngine } from '../../journal/JournalEngine.ts';

const now = '2026-10-04T00:00:00.000Z';
const ws = () =>
  E.createWorkspace({ id: 'w1', title: 'HPG Deep Dive', instrumentId: 'hpg', createdAt: now });
const journal = () =>
  JournalEngine.create({
    id: 'j1',
    symbol: 'HPG',
    title: 'Steel cycle thesis',
    thesis: {
      thesisId: 'th1',
      instrumentId: 'HPG',
      asOfDate: '2026-10-03',
      createdAt: now,
      coreThesis: 'Demand recovers as exports rise.',
      supportingEvidence: [{ kind: 'user', ref: 'ev-1', asOfDate: '2026-10-03', source: 'user' }],
      invalidationConditions: [],
    },
    entryDate: '2026-10-03',
    createdAt: now,
  });

describe('research workspace', () => {
  it('normalizes instrument id and rejects empty identity', () => {
    expect(ws().instrumentId).toBe('HPG');
    expect(() => E.createWorkspace({ id: ' ', title: 't', createdAt: now })).toThrow('WORKSPACE_ID_REQUIRED');
    expect(() => E.createWorkspace({ id: 'w', title: '  ', createdAt: now })).toThrow('WORKSPACE_TITLE_REQUIRED');
  });

  it('open questions are a legitimate state; coverage reports honestly', () => {
    const w = E.addQuestion(ws(), { id: 'q1', text: 'Is export demand durable?', at: now });
    const c = E.coverage(w);
    expect(c).toEqual({ total: 1, answered: 0, unsupportedNotes: 0, factNotes: 0, hypothesisNotes: 0 });
    const w2 = E.addNote(w, { id: 'n1', questionId: 'q1', claim: 'Exports +12% QoQ', provenance: 'FACT', confidence: 0.9, evidenceLinks: [{ kind: 'EXTERNAL_REF', refId: 'url-1', note: 'customs' }], createdAt: now });
    expect(E.coverage(w2).factNotes).toBe(1);
  });

  it('note with zero evidence is flagged UNSUPPORTED, not dropped', () => {
    const w = E.addQuestion(ws(), { id: 'q1', text: 'q', at: now });
    const w2 = E.addNote(w, { id: 'n1', questionId: 'q1', claim: 'feels like a bottom', provenance: 'HYPOTHESIS', confidence: null, evidenceLinks: [], createdAt: now });
    expect(w2.notes[0].unsupported).toBe(true);
    expect(E.coverage(w2)).toMatchObject({ unsupportedNotes: 1, hypothesisNotes: 1 });
  });

  it('cross-workspace note attachment is rejected (no silent orphans)', () => {
    const w = E.addQuestion(ws(), { id: 'q1', text: 'q', at: now });
    expect(() => E.addNote(w, { id: 'n1', questionId: 'qX', claim: 'c', provenance: 'FACT', confidence: null, evidenceLinks: [], createdAt: now })).toThrow('NOTE_QUESTION_NOT_IN_WORKSPACE');
    expect(() => E.addNote(w, { id: 'n1', questionId: 'q1', claim: '  ', provenance: 'FACT', confidence: null, evidenceLinks: [], createdAt: now })).toThrow('NOTE_CLAIM_REQUIRED');
    expect(() => E.addNote(w, { id: 'n1', questionId: 'q1', claim: 'c', provenance: 'FACT', confidence: 1.4, evidenceLinks: [], createdAt: now })).toThrow('NOTE_CONFIDENCE_RANGE');
    expect(() => E.addQuestion(w, { id: 'q1', text: 'dup', at: now })).toThrow('QUESTION_DUPLICATE');
  });

  it('journal links are validated against the real journal (fail-closed)', () => {
    const w = E.addQuestion(ws(), { id: 'q1', text: 'q', at: now });
    const withNote = E.addNote(w, { id: 'n1', questionId: 'q1', claim: 'c', provenance: 'HYPOTHESIS', confidence: null, evidenceLinks: [], createdAt: now });
    expect(E.validateEvidenceLink({ kind: 'JOURNAL_ENTRY', refId: 'nope', note: '' }, { journal: journal() })).toEqual({ valid: false, reason: 'JOURNAL_ENTRY_NOT_FOUND' });
    const linked = E.linkJournalEntry(withNote, 'n1', journal(), 'thesis entry');
    expect(linked.notes[0].unsupported).toBe(false);
    expect(linked.notes[0].evidenceLinks).toHaveLength(1);
    expect(() => E.linkJournalEntry(withNote, 'missing', journal(), 'x')).toThrow('NOTE_NOT_FOUND');
  });

  it('questions close once; answered questions still leave hypotheses visible', () => {
    const w = E.addQuestion(ws(), { id: 'q1', text: 'q', at: now });
    const answered = E.answerQuestion(w, 'q1', now);
    expect(answered.questions[0].status).toBe('ANSWERED');
    expect(E.coverage(answered).answered).toBe(1);
    expect(() => E.answerQuestion(answered, 'q1', now)).toThrow('QUESTION_ALREADY_CLOSED');
    expect(() => E.answerQuestion(w, 'nope', now)).toThrow('QUESTION_NOT_FOUND');
  });

  it('deterministic: identical inputs → identical output', () => {
    expect(ws()).toEqual(ws());
  });
});