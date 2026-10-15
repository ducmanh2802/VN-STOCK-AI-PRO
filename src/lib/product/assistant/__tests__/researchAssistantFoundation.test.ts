import { describe, expect, it } from 'vitest';
import {
  buildResearchContext,
  classifyResearchQuestion,
  decideResearchAction,
  extractNumbers,
  StubResearchLlmAdapter,
  validateResearchResponse,
  type ResearchContext,
} from '../ResearchAssistantFoundation.ts';
import { JournalEngine } from '../../journal/JournalEngine.ts';
import { ScenarioEngine } from '../../scenario/ScenarioEngine.ts';

const now = '2026-10-04T00:00:00.000Z';
const entry = () =>
  JournalEngine.create({
    id: 'j1',
    symbol: 'HPG',
    title: 'Steel cycle thesis',
    thesis: {
      thesisId: 'th1',
      instrumentId: 'HPG',
      asOfDate: '2026-10-03',
      createdAt: now,
      coreThesis: 'Exports rise.',
      supportingEvidence: [{ kind: 'user', ref: 'ev-1', asOfDate: '2026-10-03', source: 'user' }],
      invalidationConditions: [],
    },
    entryDate: '2026-10-03',
    createdAt: now,
  });
const ctx = (): ResearchContext =>
  buildResearchContext({
    journal: [entry()],
    scenarios: [
      {
        id: 'sc1',
        label: 'HPG -20%',
        result: ScenarioEngine.run({
          baseline: [{ symbol: 'HPG', quantity: 1000, markPrice: 25000, assetClass: 'EQUITY' }],
          asOfDate: '2026-10-03',
          assumptions: [{ kind: 'PRICE_SHOCK', target: 'HPG', value: -0.2, label: 'HPG -20%' }],
        }),
      },
    ],
    workspaces: [],
    concepts: [{ id: 'c1', label: 'Margin of safety', summary: 'Discount to intrinsic value that absorbs error.' }],
    asOf: '2026-10-04',
  });

describe('assistant refusal + scope', () => {
  it('refuses trade advice in VI and EN', () => {
    expect(classifyResearchQuestion('Should I buy HPG now?')).toBe('TRADE_ACTION');
    expect(classifyResearchQuestion('nên mua ngay HPG không')).toBe('TRADE_ACTION');
    expect(classifyResearchQuestion('This guarantees 30% return')).toBe('TRADE_ACTION');
    const d = decideResearchAction('Should I buy HPG now?', ctx());
    expect(d.action).toBe('REFUSE');
    expect(d.provenance).toBe('UNKNOWN');
  });
  it('unmapped questions ask for clarification instead of improvising', () => {
    expect(classifyResearchQuestion('xyzzy')).toBe('OUT_OF_SCOPE');
    expect(decideResearchAction('xyzzy', ctx()).action).toBe('ASK_CLARIFYING');
  });
  it('refuses when the required context kind was not injected', () => {
    const empty = buildResearchContext({ asOf: '2026-10-04' });
    expect(decideResearchAction('What is my portfolio weight for HPG?', empty).action).toBe('ASK_CLARIFYING');
  });
});

describe('grounded answering', () => {
  it('answers from injected context and cites the item reference', () => {
    const c = ctx();
    const d = decideResearchAction('What is in my journal for HPG?', c);
    expect(d.action).toBe('ANSWER_FROM_CONTEXT');
    expect(d.contextItemIds).toContain('journal:j1');
    const draft = `[VERIFIED] Your HPG journal entry reviews=0 (journal:j1).`;
    expect(validateResearchResponse(draft, d, c).ok).toBe(true);
  });
  it('rejects fabricated numbers not present in context', () => {
    const c = ctx();
    const d = decideResearchAction('What is in my journal for HPG?', c);
    const v = validateResearchResponse(`[VERIFIED] Position is 25000 shares (journal:j1).`, d, c);
    expect(v.ok).toBe(false);
    expect(v.violations.join()).toContain('ungrounded number: 25000');
  });
  it('rejects drafts with no provenance tag or advice verbs', () => {
    const c = ctx();
    const d = decideResearchAction('What is in my journal for HPG?', c);
    expect(validateResearchResponse('You have one entry.', d, c).violations).toContain('missing provenance tag');
    const v = validateResearchResponse('[VERIFIED] you should buy HPG (journal:j1)', d, c);
    expect(v.violations.join()).toContain('forbidden advice verb');
  });
  it('refusal drafts must refuse explicitly', () => {
    const c = ctx();
    const d = decideResearchAction('Should I buy HPG?', c);
    expect(validateResearchResponse('[EXPLANATION] Here is some context (journal:j1)', d, c).violations).toContain('refusal must be explicit');
  });
  it('scenario questions only cite scenario facts', () => {
    const c = ctx();
    const d = decideResearchAction('What if HPG drops 20%?', c);
    expect(d.contextItemIds).toContain('scenario:sc1');
    const v = validateResearchResponse(`[VERIFIED] Shocked total=20000000, absoluteImpact=-5000000 (scenario:sc1).`, d, c);
    expect(v.ok).toBe(true);
  });
});

describe('determinism + provider boundary', () => {
  it('number extraction handles separators and negatives', () => {
    expect(extractNumbers('-5,000,000 and 1_000 and -0.5')).toEqual(['-5000000', '1000', '-0.5']);
  });
  it('identical context → identical decision (no randomness, no clock)', () => {
    expect(decideResearchAction('journal', ctx())).toEqual(decideResearchAction('journal', ctx()));
  });
  it('stub adapter is deterministic and requires no provider', () => {
    const a = new StubResearchLlmAdapter();
    expect(a.generate('x'.repeat(500))).toBe(a.generate('x'.repeat(500)));
    expect(a.name).toBe('stub-product-assistant');
  });
});