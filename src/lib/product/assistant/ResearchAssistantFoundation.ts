/**
 * PRODUCT-04 — AI RESEARCH ASSISTANT FOUNDATION (pure + deterministic)
 * ==================================================================
 * Design constraints inherited from the certified Learning tutor lane:
 *  1. Core logic NEVER depends on a model provider — adapters are injected.
 *  2. Every answer must carry a provenance tag.
 *  3. Trade advice is REFUSED, not softened.
 *  4. NEW (product-grade) guard: **numeric grounding** — any number appearing in a
 *     draft must exist in the supplied verified context, otherwise the draft is a
 *     fabrication and is rejected. This is checked deterministically, pre-render.
 *
 * The assistant may only speak from explicitly injected system context (journal
 * entries, scenario results, workspace coverage). It has no market data of its own.
 */
import type { JournalEntry } from '../journal/JournalEngine.ts';
import type { ScenarioResult } from '../scenario/ScenarioEngine.ts';
import type { ResearchWorkspace } from '../research/ResearchWorkspaceEngine.ts';

export const RESEARCH_ASSISTANT_VERSION = 'v1.0.0-product-assistant';

export type ResearchProvenance = 'VERIFIED' | 'EXPLANATION' | 'ASSUMPTION' | 'SIMULATION' | 'UNKNOWN';

export type ResearchQuestionKind =
  | 'PORTFOLIO_FACT'
  | 'JOURNAL_FACT'
  | 'SCENARIO_QUESTION'
  | 'CONCEPT'
  | 'TRADE_ACTION'
  | 'OUT_OF_SCOPE';

export type ResearchAction =
  | 'ANSWER_FROM_CONTEXT'
  | 'EXPLAIN_WITH_ASSUMPTION'
  | 'ASK_CLARIFYING'
  | 'REFUSE';

export interface ResearchContextItem {
  readonly id: string;
  readonly kind: 'JOURNAL_ENTRY' | 'SCENARIO' | 'WORKSPACE' | 'CONCEPT';
  readonly label: string;
  /** Values the assistant is allowed to cite. Anything else is fabrication. */
  readonly citableFacts: readonly string[];
}

export interface ResearchContext {
  readonly items: readonly ResearchContextItem[];
  readonly asOf: string;
}

export interface ResearchDecision {
  readonly action: ResearchAction;
  readonly kind: ResearchQuestionKind;
  readonly reason: string;
  readonly provenance: ResearchProvenance;
  readonly contextItemIds: readonly string[];
}

const TRADE_PATTERNS = [
  /\b(you should|should i|i recommend|recommend buying|recommend selling)\b/i,
  /\bnên\s+(mua|bán|giữ)\b/i,
  /\b(buy|sell|hold)\s+(hpg|fpt|vnm|vci|mbb|tcb|bv|vcb|acb|techcombank)\b/i,
  /\bguarantee(s|d)?\b[^.]*\breturn\b/i,
  /chắc chắn (lãi|lời)/i,
];

const FACT_PATTERNS: ReadonlyArray<{ re: RegExp; kind: ResearchQuestionKind }> = [
  { re: /\b(what did i (decide|write)|thesis|journal|entry)\b/i, kind: 'JOURNAL_FACT' },
  { re: /\b(scenario|what if|shock|impact if)\b/i, kind: 'SCENARIO_QUESTION' },
  { re: /\b(portfolio|position|weight|allocation|exposure)\b/i, kind: 'PORTFOLIO_FACT' },
];

export function classifyResearchQuestion(question: string): ResearchQuestionKind {
  const q = question || '';
  if (TRADE_PATTERNS.some((re) => re.test(q))) return 'TRADE_ACTION';
  // Artifact-grounded questions are checked BEFORE the generic CONCEPT pattern so
  // "what is in my journal" is answered from context, not explained generically.
  for (const { re, kind } of FACT_PATTERNS) if (re.test(q)) return kind;
  if (/^(what is|what are|why|how does|define|explain|giải thích)\b/i.test(q.trim())) return 'CONCEPT';
  return 'OUT_OF_SCOPE';
}

/** Builds citable context ONLY from injected verified artifacts. */
export function buildResearchContext(input: {
  readonly journal?: readonly JournalEntry[];
  readonly scenarios?: readonly { id: string; label: string; result: ScenarioResult }[];
  readonly workspaces?: readonly ResearchWorkspace[];
  readonly concepts?: ReadonlyArray<{ id: string; label: string; summary: string }>;
  readonly asOf: string;
}): ResearchContext {
  const items: ResearchContextItem[] = [];
  for (const e of input.journal ?? []) {
    const facts = [
      `symbol=${e.symbol}`,
      `status=${e.status}`,
      `reviews=${e.reviews.length}`,
      e.decisionSnapshot ? `decision=${e.decisionSnapshot.decisionType}` : 'decision=none',
    ];
    items.push({ id: `journal:${e.id}`, kind: 'JOURNAL_ENTRY', label: e.title, citableFacts: facts });
  }
  for (const s of input.scenarios ?? []) {
    const r = s.result;
    const facts = [
      `baselineTotal=${r.baseline.totalMarketValue ?? 'NOT_AVAILABLE'}`,
      `shockedTotal=${r.shocked.totalMarketValue ?? 'NOT_AVAILABLE'}`,
      `absoluteImpact=${r.diff.absoluteImpact ?? 'NOT_AVAILABLE'}`,
      `warnings=${r.warnings.length}`,
    ];
    items.push({ id: `scenario:${s.id}`, kind: 'SCENARIO', label: s.label, citableFacts: facts });
  }
  for (const w of input.workspaces ?? []) {
    items.push({
      id: `workspace:${w.id}`,
      kind: 'WORKSPACE',
      label: w.title,
      citableFacts: [`questions=${w.questions.length}`, `notes=${w.notes.length}`],
    });
  }
  for (const c of input.concepts ?? []) {
    items.push({ id: `concept:${c.id}`, kind: 'CONCEPT', label: c.label, citableFacts: [c.summary] });
  }
  return { items, asOf: input.asOf };
}

export function decideResearchAction(question: string, ctx: ResearchContext): ResearchDecision {
  const kind = classifyResearchQuestion(question);
  if (kind === 'TRADE_ACTION') {
    return {
      action: 'REFUSE',
      kind,
      reason: 'Trade advice is out of scope; the assistant explains and cites, it does not recommend positions.',
      provenance: 'UNKNOWN',
      contextItemIds: [],
    };
  }
  if (kind === 'OUT_OF_SCOPE') {
    return {
      action: 'ASK_CLARIFYING',
      kind,
      reason: 'Question cannot be mapped to available verified context; ask for a specific symbol, entry, or scenario.',
      provenance: 'UNKNOWN',
      contextItemIds: [],
    };
  }
  const wanted: Record<string, ResearchContextItem['kind']> = {
    JOURNAL_FACT: 'JOURNAL_ENTRY',
    SCENARIO_QUESTION: 'SCENARIO',
    PORTFOLIO_FACT: 'WORKSPACE',
    CONCEPT: 'CONCEPT',
  };
  const matches = ctx.items.filter((i) => i.kind === wanted[kind]);
  if (matches.length === 0) {
    return {
      action: 'ASK_CLARIFYING',
      kind,
      reason: 'No verified context item of the required kind was injected; refuse to answer from memory.',
      provenance: 'UNKNOWN',
      contextItemIds: [],
    };
  }
  return {
    action: 'ANSWER_FROM_CONTEXT',
    kind,
    reason: 'Answerable strictly from injected verified context.',
    provenance: 'VERIFIED',
    contextItemIds: matches.map((i) => i.id),
  };
}

/** Provider boundary — identical pattern to the certified tutor lane. */
export interface ResearchLlmAdapter {
  readonly name: string;
  generate(prompt: string): string;
}

export class StubResearchLlmAdapter implements ResearchLlmAdapter {
  readonly name = 'stub-product-assistant';
  generate(prompt: string): string {
    const clipped = prompt.slice(0, 200).replace(/\s+/g, ' ').trim();
    return `[EXPLANATION] Stub assistant response: ${clipped}`;
  }
}

export interface ResearchValidation {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

/** Collects numeric tokens (incl. negatives, decimals, and 1_000_000-style magnitudes). */
export function extractNumbers(text: string): string[] {
  return (text.match(/-?\d[\d,_]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[,_]/g, ''));
}

const ADVICE_VERBS = ['you should buy', 'you should sell', 'nên mua ngay', 'nên bán ngay', 'guaranteed return', 'chắc chắn lãi'];

export function validateResearchResponse(draft: string, decision: ResearchDecision, ctx: ResearchContext): ResearchValidation {
  const violations: string[] = [];
  const text = draft || '';
  if (!/\[(VERIFIED|EXPLANATION|ASSUMPTION|SIMULATION|UNKNOWN)\]/.test(text)) violations.push('missing provenance tag');
  const low = text.toLowerCase();
  if (ADVICE_VERBS.some((v) => low.includes(v))) violations.push('forbidden advice verb');

  // Numeric grounding guard: no number outside the injected context.
  // Context-item references and provenance tags are scrubbed first, otherwise the
  // digits inside ids (e.g. `journal:j1`) would be misread as fabricated figures.
  const allowed = new Set<string>();
  for (const item of ctx.items) for (const fact of item.citableFacts) for (const n of extractNumbers(fact)) allowed.add(n);
  let scrubbed = text;
  for (const item of ctx.items) scrubbed = scrubbed.split(item.id).join('<ctx-ref>');
  scrubbed = scrubbed.replace(/\[[A-Z_]+\]/g, '<tag>');
  for (const n of extractNumbers(scrubbed)) {
    if (!allowed.has(n)) violations.push(`ungrounded number: ${n}`);
  }
  if (decision.action === 'ANSWER_FROM_CONTEXT') {
    if (decision.provenance === 'VERIFIED' && !text.includes('[VERIFIED]')) violations.push('verified answer missing [VERIFIED] tag');
    const cited = decision.contextItemIds.some((id) => text.includes(id));
    if (!cited) violations.push('answer cites no context item reference');
  }
  if (decision.action === 'REFUSE' && !/cannot|không thể|refuse|từ chối|out of scope/i.test(text)) {
    violations.push('refusal must be explicit');
  }
  return { ok: violations.length === 0, violations };
}