import { describe, expect, it } from 'vitest';
import {
  StubLlmAdapter,
  buildTutorContext,
  classifyQuestion,
  decideTutorAction,
  isCatalogExercise,
  validateTutorResponse,
} from '../TutorFoundation';
import { buildGraph } from '../KnowledgeGraph';

const g = buildGraph();

describe('question classification', () => {
  it('trade advice is TRADE_ACTION (EN + VI)', () => {
    expect(classifyQuestion('Should I buy HPG now?')).toBe('TRADE_ACTION');
    expect(classifyQuestion('Có nên bán ACB không?')).toBe('TRADE_ACTION');
  });
  it('price/metric questions are MARKET_FACT', () => {
    expect(classifyQuestion('What is the current price of FPT?')).toBe('MARKET_FACT');
    expect(classifyQuestion('Giá hiện tại của VCB là bao nhiêu?')).toBe('MARKET_FACT');
  });
  it('concept questions and empties classify safely', () => {
    expect(classifyQuestion('What is TTM?')).toBe('CONCEPT');
    expect(classifyQuestion('   ')).toBe('UNSUPPORTED');
  });
});

describe('tutor policy (deterministic)', () => {
  it('trade + market-fact questions are REFUSED with lesson redirect', () => {
    const t = decideTutorAction('Should I sell everything?', 'les-market-101');
    expect(t.action).toBe('REFUSE');
    expect(t.lessonRef).toBe('les-risk-105');
    const m = decideTutorAction('Giá hiện tại của HPG?', 'les-market-101');
    expect(m.action).toBe('REFUSE');
    expect(m.provenance).toBe('UNKNOWN');
  });
  it('catalog-matching questions answer with provenance + lesson ref', () => {
    const d = decideTutorAction('Explain les-risk-105 position sizing', 'les-market-101');
    expect(d.action).toBe('ANSWER_FROM_CATALOG');
    expect(d.provenance).toBe('VERIFIED');
    expect(d.lessonRef).toBe('les-risk-105');
  });
  it('unmatched concept questions become grounded hints, never answers', () => {
    const d = decideTutorAction('Tell me about behavioral finance paradoxes', 'les-market-101');
    expect(d.action).toBe('HINT');
    expect(d.provenance).toBe('EXPLANATION');
  });
  it('policy is deterministic', () => {
    const q = 'Should I buy HPG now?';
    expect(decideTutorAction(q, 'les-market-101')).toEqual(decideTutorAction(q, 'les-market-101'));
  });
});

describe('context selection + missing context', () => {
  it('known lesson yields VERIFIED context with mastery + graph links', () => {
    const ctx = buildTutorContext(g, [{ conceptId: 'c-stock', state: 'PRACTICING', score: 0.5 }], 'les-market-101');
    expect(ctx.provenance).toBe('VERIFIED');
    expect(ctx.concepts.some((c) => c.mastery === 'PRACTICING')).toBe(true);
    expect(ctx.concepts[0].taughtIn).toContain('les-market-101');
    expect(ctx.limits.length).toBeGreaterThan(0);
  });
  it('unknown lesson yields UNKNOWN with explicit limits', () => {
    const ctx = buildTutorContext(g, [], 'les-ghost');
    expect(ctx.provenance).toBe('UNKNOWN');
    expect(ctx.lessonId).toBeNull();
  });
});

describe('response validation + adapter isolation', () => {
  it('stub adapter is deterministic and network-free', () => {
    const a = new StubLlmAdapter();
    expect(a.generate('hello')).toBe(a.generate('hello'));
    expect(a.name).toBe('stub-test-adapter');
  });
  it('valid catalog answer passes; advice verbs and missing refs fail', () => {
    const d = decideTutorAction('Explain les-risk-105 position sizing', 'les-market-101');
    expect(validateTutorResponse('[VERIFIED] Per les-risk-105, size = budget/distance.', d).ok).toBe(true);
    expect(validateTutorResponse('No tag here.', d).ok).toBe(false);
    expect(validateTutorResponse('[VERIFIED] You should buy HPG now via les-risk-105.', d).ok).toBe(false);
    const r = decideTutorAction('Should I buy HPG?', 'les-market-101');
    expect(validateTutorResponse('[UNKNOWN] I cannot advise trades; see les-risk-105.', r).ok).toBe(true);
    expect(validateTutorResponse('[UNKNOWN] Maybe consider it, see les-risk-105.', r).ok).toBe(false);
  });
  it('catalog retrieval guard distinguishes real vs invented ids', () => {
    expect(isCatalogExercise('ex-stale-01')).toBe(true);
    expect(isCatalogExercise('ex-invented-99')).toBe(false);
  });
});
