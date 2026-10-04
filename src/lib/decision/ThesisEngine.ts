/**
 * DECISION-02 — INVESTMENT THESIS ENGINE
 * =======================================
 * Evidence-linked thesis: every claim traces claim → metric/event/analysis →
 * source → as-of date. Bull/Base/Bear scenarios with optional probability
 * (never invented: probability null unless justified by caller).
 * Invalidation conditions only from supported data. Lifecycle append-only:
 * history never rewritten.
 */
import type { EvidenceRef, InvestmentThesis, ThesisScenario, ThesisStatus } from './types.ts';
import { DECISION_OS_VERSION } from './types.ts';

export interface CreateThesisInput {
  readonly thesisId: string;
  readonly instrumentId: string;
  readonly asOfDate: string;
  readonly createdAt: string;
  readonly coreThesis: string;
  readonly supportingEvidence: readonly EvidenceRef[];
  readonly catalysts?: readonly string[];
  readonly risks?: readonly string[];
  readonly valuationArgument?: string | null;
  readonly industryContext?: string | null;
  readonly macroContext?: string | null;
  readonly expectedOutcome?: string | null;
  readonly timeHorizon?: string | null;
  readonly invalidationConditions?: readonly string[];
  readonly scenarios?: readonly ThesisScenario[];
}

const SUPPORTED_INVALIDATION = new Set([
  'earnings deterioration',
  'margin compression',
  'debt increase',
  'valuation breach',
  'industry regime change',
  'macro regime change',
  'technical invalidation',
  'risk limit breach',
]);

export class ThesisEngine {
  static create(input: CreateThesisInput): InvestmentThesis {
    if (!input.coreThesis || !input.coreThesis.trim()) throw new Error('THESIS_EMPTY');
    if (input.supportingEvidence.length === 0) throw new Error('THESIS_WITHOUT_EVIDENCE');
    for (const e of input.supportingEvidence) {
      if (!e.asOfDate || !e.source || !e.ref) throw new Error('EVIDENCE_NOT_LINKED');
    }
    const invalidation = (input.invalidationConditions ?? []).filter((c) =>
      SUPPORTED_INVALIDATION.has(c.trim().toLowerCase())
    );
    const scenarios = (input.scenarios ?? []).map((s) => ({
      ...s,
      probability: s.probability ?? null,
    }));
    for (const s of scenarios) {
      if (s.probability !== null && !(s.probability >= 0 && s.probability <= 1)) {
        throw new Error('INVALID_PROBABILITY');
      }
    }
    return {
      thesisId: input.thesisId,
      instrumentId: input.instrumentId,
      asOfDate: input.asOfDate,
      status: 'DRAFT',
      coreThesis: input.coreThesis.trim(),
      supportingEvidence: [...input.supportingEvidence],
      catalysts: [...(input.catalysts ?? [])],
      risks: [...(input.risks ?? [])],
      valuationArgument: input.valuationArgument ?? null,
      industryContext: input.industryContext ?? null,
      macroContext: input.macroContext ?? null,
      expectedOutcome: input.expectedOutcome ?? null,
      timeHorizon: input.timeHorizon ?? null,
      invalidationConditions: invalidation,
      scenarios,
      history: [{ status: 'DRAFT', at: input.createdAt, note: 'created' }],
      version: DECISION_OS_VERSION,
    };
  }

  static transition(
    thesis: InvestmentThesis,
    to: ThesisStatus,
    at: string,
    note: string
  ): InvestmentThesis {
    const allowed: Record<ThesisStatus, readonly ThesisStatus[]> = {
      DRAFT: ['ACTIVE', 'CLOSED'],
      ACTIVE: ['CHALLENGED', 'INVALIDATED', 'CONFIRMED', 'CLOSED'],
      CHALLENGED: ['ACTIVE', 'INVALIDATED', 'CONFIRMED', 'CLOSED'],
      INVALIDATED: ['CLOSED'],
      CONFIRMED: ['CHALLENGED', 'CLOSED'],
      CLOSED: [],
    };
    if (!allowed[thesis.status].includes(to)) throw new Error(`INVALID_TRANSITION:${thesis.status}->${to}`);
    return {
      ...thesis,
      status: to,
      history: [...thesis.history, { status: to, at, note }],
    };
  }
}
