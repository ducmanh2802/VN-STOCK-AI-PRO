// TutorFoundation — LEARNING-13 AI tutor safety foundation. Pure + deterministic.
// The tutor is NEVER the source of truth for financial facts: it may explain
// approved catalog concepts, hint, and redirect — it must refuse market-data
// questions, trade advice, and anything outside the verified catalog.
// No LLM wiring here: an isolated adapter interface + deterministic test stub.
import { CONCEPTS, EXERCISES, LESSONS, getLesson } from './catalog';
import { practicedBy, taughtBy, type KnowledgeGraph } from './KnowledgeGraph';
import type { ConceptMastery } from './types';

export type Provenance = 'VERIFIED' | 'EXPLANATION' | 'ASSUMPTION' | 'SIMULATION' | 'UNKNOWN';

export type TutorQuestionKind = 'CONCEPT' | 'MARKET_FACT' | 'TRADE_ACTION' | 'UNSUPPORTED';

export type TutorAction = 'ANSWER_FROM_CATALOG' | 'HINT' | 'REDIRECT_TO_LESSON' | 'REFUSE';

const TRADE_PATTERNS = [
  'should i buy', 'should i sell', 'nên mua', 'nên bán', 'mua hay bán', 'buy or sell',
  'give me a trade', 'place an order', 'đặt lệnh',
];
const MARKET_FACT_PATTERNS = [
  'current price', 'giá hiện tại', 'price of ', 'giá của ', 'how much is ', 'bao nhiêu',
  'today\u2019s close', 'hôm nay đóng cửa', 'p/e of ', 'market cap of ',
];

function norm(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Heuristic classifier (foundation-grade; an LLM must still pass policy after it). */
export function classifyQuestion(question: string): TutorQuestionKind {
  const q = norm(question);
  if (!q) return 'UNSUPPORTED';
  if (TRADE_PATTERNS.some((p) => q.includes(p)) || /\bbuy\b|\bsell\b|\bmua\b|\bbán\b/u.test(q)) return 'TRADE_ACTION';
  if (MARKET_FACT_PATTERNS.some((p) => q.includes(p))) return 'MARKET_FACT';
  return 'CONCEPT';
}

export interface TutorConceptContext {
  conceptId: string;
  title: string;
  mastery: string;
  taughtIn: string[];
  practicedIn: string[];
}

export interface TutorContext {
  provenance: Provenance;
  lessonId: string | null;
  lessonTitle: string | null;
  concepts: TutorConceptContext[];
  limits: string[];
}

export function buildTutorContext(
  g: KnowledgeGraph,
  mastery: ConceptMastery[],
  lessonId: string | null,
): TutorContext {
  const lesson = lessonId ? getLesson(lessonId) : undefined;
  if (!lesson) {
    return {
      provenance: 'UNKNOWN',
      lessonId: null,
      lessonTitle: null,
      concepts: [],
      limits: ['Unknown lesson: no verified context available. Refuse or redirect.'],
    };
  }
  const m = new Map(mastery.map((x) => [x.conceptId, x.state]));
  const concepts: TutorConceptContext[] = lesson.conceptIds.map((c) => {
    const def = CONCEPTS.find((x) => x.id === c);
    return {
      conceptId: c,
      title: def?.title ?? c,
      mastery: m.get(c) ?? 'NOT_STARTED',
      taughtIn: taughtBy(g, c),
      practicedIn: practicedBy(g, c),
    };
  });
  return {
    provenance: 'VERIFIED',
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    concepts,
    limits: [
      'Catalog concepts only; no market data; no trade advice; SIMULATED figures stay labeled.',
    ],
  };
}

export interface TutorDecision {
  action: TutorAction;
  reason: string;
  provenance: Provenance;
  lessonRef: string | null;
}

const LESSON_KEYWORDS: { id: string; keys: string[] }[] = LESSONS.map((l) => ({
  id: l.id,
  keys: [l.id, ...l.conceptIds, ...l.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4)],
}));

/** Deterministic policy: allowed context/actions + mandatory refusal classes. */
export function decideTutorAction(question: string, fallbackLessonId: string): TutorDecision {
  const kind = classifyQuestion(question);
  if (kind === 'TRADE_ACTION') {
    return {
      action: 'REFUSE',
      reason: 'Trade advice is forbidden: the tutor never recommends buy/sell or order placement.',
      provenance: 'UNKNOWN',
      lessonRef: 'les-risk-105',
    };
  }
  if (kind === 'MARKET_FACT') {
    return {
      action: 'REFUSE',
      reason: 'The tutor has no market-data access and never fabricates prices or metrics. Check Data Health / StockDetail for real values with provenance.',
      provenance: 'UNKNOWN',
      lessonRef: 'les-price-volume-102',
    };
  }
  if (kind === 'UNSUPPORTED') {
    return {
      action: 'REDIRECT_TO_LESSON',
      reason: 'Empty or unclassifiable question: redirect to the current lesson.',
      provenance: 'UNKNOWN',
      lessonRef: fallbackLessonId,
    };
  }
  const q = norm(question);
  const hit = LESSON_KEYWORDS.find((l) => l.keys.some((k) => k && q.includes(k)));
  if (hit) {
    return {
      action: 'ANSWER_FROM_CATALOG',
      reason: `Question matches catalog lesson ${hit.id}; answer must stay within its verified content.`,
      provenance: 'VERIFIED',
      lessonRef: hit.id,
    };
  }
  return {
    action: 'HINT',
    reason: 'Concept question without a direct lesson match: give a Socratic hint grounded in catalog concepts only.',
    provenance: 'EXPLANATION',
    lessonRef: fallbackLessonId,
  };
}

/** LLM boundary: core engines never depend on a provider; adapters are injected. */
export interface LlmAdapter {
  readonly name: string;
  generate(prompt: string): string;
}

/** Deterministic test adapter (no network, no API key, bounded output). */
export class StubLlmAdapter implements LlmAdapter {
  readonly name = 'stub-test-adapter';
  generate(prompt: string): string {
    const clipped = prompt.slice(0, 200).replace(/\s+/g, ' ').trim();
    return `[EXPLANATION] Stub tutor response for verified context: ${clipped}`;
  }
}

export interface TutorValidation {
  ok: boolean;
  violations: string[];
}

const ADVICE_VERBS = ['you should buy', 'you should sell', 'nên mua ngay', 'nên bán ngay', 'guaranteed return', 'chắc chắn lãi'];

/** Response validator: provenance tag required; advice verbs forbidden; catalog ref required when answering. */
export function validateTutorResponse(draft: string, decision: TutorDecision): TutorValidation {
  const violations: string[] = [];
  const text = draft || '';
  if (!/\[(VERIFIED|EXPLANATION|ASSUMPTION|SIMULATION|UNKNOWN)\]/.test(text)) {
    violations.push('missing provenance tag');
  }
  const low = text.toLowerCase();
  if (ADVICE_VERBS.some((v) => low.includes(v))) violations.push('forbidden advice verb');
  if (decision.action === 'ANSWER_FROM_CATALOG' && decision.lessonRef && !text.includes(decision.lessonRef)) {
    violations.push('answer missing catalog lesson reference');
  }
  if (decision.action === 'REFUSE' && !/cannot|không thể|refuse|từ chối/i.test(text)) {
    violations.push('refusal must be explicit');
  }
  return { ok: violations.length === 0, violations };
}

/** Convenience: is this exercise id referenced by any catalog concept path (retrieval guard)? */
export function isCatalogExercise(exerciseId: string): boolean {
  return EXERCISES.some((e) => e.id === exerciseId);
}
